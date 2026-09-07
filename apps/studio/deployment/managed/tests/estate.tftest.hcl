mock_provider "aws" {}
mock_provider "b2" {}
mock_provider "cloudflare" {}
mock_provider "crunchybridge" {}

variables {
  estate_name                      = "networkcanvas-studio"
  cloudflare_account_id            = "00000000000000000000000000000000"
  cloudflare_api_token             = "fixture"
  crunchybridge_application_secret = "fixture"
  crunchybridge_team_id            = "01ARZ3NDEKTSV4RRFFQ69G5FAV"
  crunchybridge_hobby_2_plan_id    = "hobby-2-fixture"
  b2_application_key_id            = "fixture"
  b2_application_key               = "fixture"
  b2_endpoint                      = "https://api.backblazeb2.com"
  b2_bucket_name                   = "networkcanvas-independent-recovery-fixture"
  b2_region                        = "us-west-004"
  kms_admin_principal_arns         = ["arn:aws:iam::000000000000:role/kms-admin"]
  kms_runtime_decrypt_principal_arns = {
    production = ["arn:aws:iam::000000000000:role/production-runtime"]
    staging    = ["arn:aws:iam::000000000000:role/staging-runtime"]
  }
  kms_wrapping_principal_arns = {
    production = ["arn:aws:iam::000000000000:role/production-wrapper"]
    staging    = ["arn:aws:iam::000000000000:role/staging-wrapper"]
  }
  deployment_ids = {
    production = "studio-production"
    staging    = "studio-staging"
  }
  signed_image_references = {
    studio   = "ghcr.io/complexdatacollective/studio@sha256:1111111111111111111111111111111111111111111111111111111111111111"
    registry = "ghcr.io/complexdatacollective/template-registry@sha256:2222222222222222222222222222222222222222222222222222222222222222"
  }
  service_resources = {
    studio-production   = { cpu_kind = "shared", cpus = 1, memory_mb = 512 }
    studio-staging      = { cpu_kind = "shared", cpus = 1, memory_mb = 512 }
    registry-production = { cpu_kind = "shared", cpus = 1, memory_mb = 512 }
    registry-staging    = { cpu_kind = "shared", cpus = 1, memory_mb = 512 }
  }
}

run "candidate_contract" {
  command = plan

  assert {
    condition     = length(output.candidate_inventory.fly.machine_api_specs) == 4
    error_message = "The Fly handoff must contain exactly four singleton specs."
  }

  assert {
    condition     = alltrue([for spec in values(output.candidate_inventory.fly.machine_api_specs) : spec.region == "iad" && spec.count == 1 && spec.auto_stop == false])
    error_message = "Every service must remain an always-on singleton in IAD."
  }

  assert {
    condition     = output.candidate_inventory.fly.machine_api_specs["studio-production"].environment.STUDIO_DEPLOYMENT_MODE == "managed" && length(output.candidate_inventory.fly.machine_api_specs["registry-production"].environment) == 0
    error_message = "Only Studio receives the shared-artifact deployment-mode switch."
  }

  assert {
    condition     = cloudflare_r2_bucket.primary["studio-production"].jurisdiction == "us" && length(cloudflare_r2_bucket.primary) == 4
    error_message = "Four primary buckets must use the enforceable US jurisdiction."
  }

  assert {
    condition     = crunchybridge_cluster.postgres.provider_id == "aws" && crunchybridge_cluster.postgres.region_id == "us-east-1" && crunchybridge_cluster.postgres.is_ha == false
    error_message = "The database candidate must remain the single AWS us-east-1 cluster."
  }

  assert {
    condition     = alltrue([for key in values(aws_kms_key.studio_root) : key.enable_key_rotation && key.rotation_period_in_days == 365])
    error_message = "Both KMS keys must rotate annually."
  }

  assert {
    condition     = b2_bucket.independent_recovery.bucket_type == "allPrivate" && b2_bucket.independent_recovery.file_lock_configuration[0].default_retention[0].mode == "compliance" && b2_bucket.independent_recovery.file_lock_configuration[0].default_retention[0].period[0].duration == 31
    error_message = "The independent bucket must be private with 31-day compliance retention."
  }
}

run "reject_mutable_image" {
  command = plan

  variables {
    signed_image_references = {
      studio   = "ghcr.io/complexdatacollective/studio:latest"
      registry = "ghcr.io/complexdatacollective/template-registry@sha256:2222222222222222222222222222222222222222222222222222222222222222"
    }
  }

  expect_failures = [var.signed_image_references]
}
