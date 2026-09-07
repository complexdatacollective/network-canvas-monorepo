locals {
  fly_region = jsondecode(file("${path.module}/candidate-sizing.json")).region
  aws_region = "us-east-1"

  databases = {
    studio-production   = "studio_production"
    studio-staging      = "studio_staging"
    registry-production = "registry_production"
    registry-staging    = "registry_staging"
  }

  r2_buckets = {
    for purpose in keys(local.databases) : purpose => "${var.estate_name}-${purpose}"
  }

  service_images = {
    studio-production   = var.signed_image_references.studio
    studio-staging      = var.signed_image_references.studio
    registry-production = var.signed_image_references.registry
    registry-staging    = var.signed_image_references.registry
  }

  # Fly's official Terraform provider is archived. These service requirements
  # are a handoff to a separately implemented authenticated deployment module,
  # not Machines API request bodies. This foundation does not create Machines.
  fly_machine_specs = {
    for name, resources in var.service_resources : name => {
      name       = "${var.estate_name}-${name}"
      region     = local.fly_region
      image      = local.service_images[name]
      count      = 1
      auto_stop  = false
      auto_start = true
      resources  = resources
      environment = startswith(name, "studio-") ? {
        STUDIO_DEPLOYMENT_MODE = "managed"
        STUDIO_ROLE            = "both"
      } : {}
    }
  }

  kms_context = {
    for environment, deployment_id in var.deployment_ids : environment => {
      "kms:EncryptionContext:studio-deployment" = deployment_id
      "kms:EncryptionContext:studio-purpose"    = "root-key.v1"
    }
  }
}

resource "cloudflare_r2_bucket" "primary" {
  for_each = local.r2_buckets

  account_id    = var.cloudflare_account_id
  name          = each.value
  jurisdiction  = "us"
  storage_class = "Standard"

  lifecycle {
    prevent_destroy = true
  }
}

resource "crunchybridge_cluster" "postgres" {
  team_id       = var.crunchybridge_team_id
  name          = "${var.estate_name}-postgres"
  provider_id   = "aws"
  region_id     = "us-east-1"
  plan_id       = var.crunchybridge_hobby_2_plan_id
  is_ha         = false
  storage       = var.postgres_storage_gb
  major_version = var.postgres_major_version

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_kms_key" "studio_root" {
  for_each = toset(["production", "staging"])

  description             = "${var.estate_name} ${each.key} Studio application-root wrapping"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  rotation_period_in_days = 365

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "KeyAdministration"
        Effect    = "Allow"
        Principal = { AWS = sort(tolist(var.kms_admin_principal_arns)) }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "RuntimeDecryptWithExactContext"
        Effect    = "Allow"
        Principal = { AWS = sort(tolist(var.kms_runtime_decrypt_principal_arns[each.key])) }
        Action    = ["kms:Decrypt"]
        Resource  = "*"
        Condition = {
          StringEquals = local.kms_context[each.key]
          StringLike = {
            "kms:EncryptionContext:studio-root-reference" = "STUDIO_ENCRYPTION_ROOT_*"
          }
        }
      },
      {
        Sid       = "OperatorWrapWithExactContext"
        Effect    = "Allow"
        Principal = { AWS = sort(tolist(var.kms_wrapping_principal_arns[each.key])) }
        Action    = ["kms:Encrypt", "kms:GenerateDataKey"]
        Resource  = "*"
        Condition = {
          StringEquals = local.kms_context[each.key]
          StringLike = {
            "kms:EncryptionContext:studio-root-reference" = "STUDIO_ENCRYPTION_ROOT_*"
          }
        }
      },
    ]
  })

  tags = {
    Estate      = var.estate_name
    Environment = each.key
    Purpose     = "studio-root-wrapping"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_kms_alias" "studio_root" {
  for_each = aws_kms_key.studio_root

  name          = "alias/${var.estate_name}-${each.key}-studio-root"
  target_key_id = each.value.key_id
}

resource "b2_bucket" "independent_recovery" {
  bucket_name = var.b2_bucket_name
  bucket_type = "allPrivate"

  default_server_side_encryption {
    algorithm = "AES256"
    mode      = "SSE-B2"
  }

  file_lock_configuration {
    is_file_lock_enabled = true
    default_retention {
      mode = "compliance"
      period {
        duration = 31
        unit     = "days"
      }
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

check "managed_estate_shape" {
  assert {
    condition     = length(local.fly_machine_specs) == 4 && length(local.databases) == 4 && length(local.r2_buckets) == 4
    error_message = "The candidate estate requires four singleton services, logical databases, and distinct primary buckets."
  }
  assert {
    condition     = alltrue([for spec in values(local.fly_machine_specs) : spec.region == "iad" && spec.count == 1 && !spec.auto_stop])
    error_message = "Every persistent service must be one always-on Fly Machine in IAD."
  }
}
