output "instance_public_ip" {
  description = "Point the DNS A record here at cutover."
  value       = aws_eip.app.public_ip
}

output "instance_id" {
  value = aws_instance.app.id
}

output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "github_actions_role_arn" {
  value = aws_iam_role.github_actions.arn
}

output "grafana_url" {
  value = "http://${aws_eip.app.public_ip}:30030/"
}

output "set_secrets_commands" {
  description = "Run these once to populate the real secret values."
  value = join("\n", [
    for name in local.secret_names :
    "aws ssm put-parameter --name /${var.project_name}/${name} --type SecureString --overwrite --value '<value>'"
  ])
}
