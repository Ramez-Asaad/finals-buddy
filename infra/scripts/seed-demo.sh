#!/bin/bash
# Seeds a demo account, one subject, and a course material file, then runs a
# few tutor questions so the dashboards show real retrieval scores, token
# compression and latency instead of flat zeros.
#
# Runs against the in-cluster service, so it works before DNS cutover.
# Safe to re-run: signup fails with 409 the second time and it falls back to
# logging in.
set -uo pipefail

export KUBECONFIG=${KUBECONFIG:-/etc/rancher/k3s/k3s.yaml}
export PATH=$PATH:/usr/local/bin

IP=$(kubectl get svc finals-buddy-api -n finals-buddy -o jsonpath='{.spec.clusterIP}')
BASE="http://$IP:8000"
EMAIL="${DEMO_EMAIL:-demo@finalsbuddy.local}"
PASS="${DEMO_PASSWORD:-DemoStudent2026!}"

jget() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('$1',''))" 2>/dev/null; }

echo "== signup or login =="
TOKEN=$(curl -s --max-time 30 -X POST "$BASE/api/auth/signup" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Demo Student\",\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | jget token)

if [ -z "$TOKEN" ]; then
  TOKEN=$(curl -s --max-time 30 -X POST "$BASE/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | jget token)
fi
[ -z "$TOKEN" ] && { echo "could not obtain a token"; exit 1; }
AUTH="Authorization: Bearer $TOKEN"
echo "token acquired"

# Put the demo account on its own Groq key. Server-key usage is capped by the
# free trial, which this script exhausts after a couple of runs, so without
# this the seeding silently stops producing AI traffic. The key is read from
# SSM using the instance role and is never echoed.
echo "== attach Groq key to demo account =="
GROQ_KEY=$(aws ssm get-parameter --name /finals-buddy/GROQ_API_KEY --with-decryption \
  --region "${AWS_REGION:-us-east-1}" --query Parameter.Value --output text 2>/dev/null)
if [ -n "$GROQ_KEY" ] && [ "$GROQ_KEY" != "placeholder-set-out-of-band" ]; then
  RES=$(curl -s --max-time 60 -X PUT "$BASE/api/account/groq-key" -H "$AUTH" \
    -H 'Content-Type: application/json' -d "{\"api_key\":\"$GROQ_KEY\"}" -o /dev/null -w '%{http_code}')
  echo "  groq-key set, http $RES"
else
  echo "  no usable key in SSM, continuing on the free trial"
fi

echo "== create subject =="
SUBJECT_ID=$(curl -s --max-time 30 -X POST "$BASE/api/subjects" -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Operating Systems","exam_date":"2026-11-10","priority_level":5,"difficulty":4,"confidence_score":40}' | jget id)
[ -z "$SUBJECT_ID" ] && { echo "subject creation failed"; exit 1; }
echo "subject id $SUBJECT_ID"

cat > /tmp/os-lecture.txt <<'LECTURE'
Operating Systems, Lecture 4: Process Scheduling

A process is a program in execution. The operating system represents each
process with a process control block, which stores the process identifier,
its current state, the program counter, the contents of the CPU registers,
memory limits, and the list of open files. When the scheduler switches from
one process to another it performs a context switch: it saves the state of
the running process into its process control block and restores the state of
the process it is switching to. Context switching is pure overhead, because
no useful work happens while the kernel saves and restores state.

A process moves between five states. It starts in the new state while it is
being created. It becomes ready when it is waiting to be assigned to a
processor. It is running while instructions are executing. It becomes
blocked, sometimes called waiting, when it needs an event such as the
completion of an input or output operation. Finally it reaches the
terminated state when execution finishes.

Scheduling criteria determine what a good schedule means. CPU utilisation
should be kept high. Throughput counts how many processes complete per unit
of time. Turnaround time measures the total time from submission to
completion. Waiting time measures how long a process sits in the ready
queue. Response time measures how long it takes before a process produces
its first output, which matters most for interactive systems.

First Come First Served scheduling runs processes in arrival order. It is
simple and never starves a process, but it suffers from the convoy effect:
one long CPU-bound process holds the processor while many short processes
queue behind it, which drives average waiting time up sharply.

Shortest Job First selects the process with the smallest next CPU burst. It
is provably optimal for average waiting time, but it requires knowing the
length of the next burst in advance, which is not possible in practice. Real
systems estimate it using exponential averaging of previous bursts.

Round Robin scheduling gives each process a fixed time quantum, typically
between ten and one hundred milliseconds. When the quantum expires the
process is preempted and moved to the tail of the ready queue. The choice of
quantum matters: if it is too large Round Robin degenerates into First Come
First Served, and if it is too small the system spends an excessive fraction
of its time performing context switches rather than running user code.

Priority scheduling assigns each process a priority and runs the highest
priority runnable process. Its central problem is starvation, where a low
priority process may never execute because higher priority work keeps
arriving. The standard remedy is aging, which gradually raises the priority
of a process the longer it waits in the ready queue.

Multilevel feedback queues combine these ideas. The system keeps several
queues with different quanta and priorities, and moves processes between
them based on observed behaviour. A process that repeatedly uses its entire
quantum is treated as CPU-bound and demoted to a lower priority queue with a
longer quantum, while a process that yields early is treated as interactive
and kept at high priority.

Deadlock arises when four conditions hold at once: mutual exclusion, hold
and wait, no preemption, and circular wait. Breaking any single one of these
four conditions prevents deadlock from occurring. The banker's algorithm
avoids deadlock by refusing any resource allocation that would leave the
system in an unsafe state, where an unsafe state is one in which no sequence
of allocations allows every process to finish.
LECTURE

echo "== upload material (AI ingestion + chunk indexing) =="
UP=$(curl -s --max-time 300 -X POST "$BASE/api/materials/upload" -H "$AUTH" \
  -F "subject_id=$SUBJECT_ID" -F "file=@/tmp/os-lecture.txt")
echo "$UP" | head -c 300
echo

echo "== tutor questions, to exercise retrieval and the Groq agent =="
# Groq's free tier limits tokens per minute, and one agent run can make
# several calls. Firing these back to back trips the limit, which then falls
# over to the backup key. Pacing them keeps the seed data clean.
ask() {
  echo "--- $1"
  curl -s --max-time 180 -X POST "$BASE/api/tutor/chat" -H "$AUTH" \
    -F "subject_id=$SUBJECT_ID" -F "query=$1" -F "mode=standard" | head -c 220
  echo
  sleep "${ASK_DELAY:-30}"
}
ask "What are the four conditions required for deadlock?"
ask "Why is the Round Robin time quantum size important?"
ask "What is the convoy effect in First Come First Served scheduling?"
ask "How does aging prevent starvation in priority scheduling?"

echo "== a question the corpus cannot answer, to exercise the low-similarity path =="
ask "What is the capital city of Portugal?"

echo "done"
