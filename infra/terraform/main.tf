data "aws_caller_identity" "current" {}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
}

resource "aws_security_group" "app" {
  name        = "${var.project_name}-sg"
  description = "Finals Buddy: HTTP/HTTPS public for the API, Grafana restricted to the operator"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "HTTP, also used by ACME HTTP-01 certificate validation"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS API traffic from the Vercel frontend and browsers"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Grafana, operator only"
    from_port   = 30030
    to_port     = 30030
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_instance" "app" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnets.default.ids[0]
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name

  # No SSH key pair. Access is through SSM Session Manager, so there is no
  # long-lived private key to store in GitHub, which is what the old Oracle
  # deploy workflow had to do.

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
  }

  user_data = templatefile("${path.module}/user_data.sh.tpl", {
    app_namespace = "finals-buddy"
    repo_url      = var.repo_url
    aws_region    = var.aws_region
    account_id    = data.aws_caller_identity.current.account_id
    domain_name   = var.domain_name
  })
  user_data_replace_on_change = true

  tags = {
    Name = "${var.project_name}-node"
  }
}

resource "aws_eip" "app" {
  instance = aws_instance.app.id
  domain   = "vpc"
}
