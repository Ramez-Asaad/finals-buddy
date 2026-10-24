# Application secrets live in SSM Parameter Store, encrypted, and are pulled
# into a Kubernetes Secret at boot and on a timer.
#
# Terraform creates each parameter with a placeholder and then deliberately
# ignores its value forever. Real secret values are written out of band with
# `aws ssm put-parameter --overwrite`, so no Groq key is ever committed to git
# or captured in terraform state. The old setup kept these in a .env file
# copied onto the box by hand, which meant rotating a key required SSH.

# SECRET_KEY is deliberately absent: auth.py generates one into .auth_secret
# beside the database on first boot, and that file lives on the persistent
# volume, so it survives restarts without anyone having to manage it.
locals {
  secret_names = [
    "GROQ_API_KEY",
    "GROQ_API_KEY_2",
    "OPENAI_API_KEY",
    "ADMIN_EMAILS",
    "CORS_ORIGINS",
  ]
}

resource "aws_ssm_parameter" "app_secret" {
  for_each = toset(local.secret_names)

  name  = "/${var.project_name}/${each.value}"
  type  = "SecureString"
  value = "placeholder-set-out-of-band"

  lifecycle {
    ignore_changes = [value]
  }
}
