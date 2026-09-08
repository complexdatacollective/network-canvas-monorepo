mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { arn = "arn:aws:sts::000000000000:assumed-role/kms-admin/deployment" }
  }
  mock_data "aws_iam_session_context" {
    defaults = { issuer_arn = "arn:aws:iam::000000000000:role/kms-admin" }
  }
}
mock_provider "b2" {}
mock_provider "cloudflare" {}
mock_provider "crunchybridge" {
  mock_data "crunchybridge_cloudprovider" {
    defaults = {
      plans   = [{ plan_id = "hobby-2", plan_name = "Hobby-2", plan_cpu = 1, plan_memory = 2 }]
      regions = [{ region_id = "us-east-1", region_name = "US East", region_location = "N. Virginia" }]
    }
  }
}

variables {
  estate_name                      = "networkcanvas-studio"
  cloudflare_account_id            = "00000000000000000000000000000000"
  cloudflare_api_token             = "fixture"
  crunchybridge_application_secret = "fixture"
  crunchybridge_team_id            = "01ARZ3NDEKTSV4RRFFQ69G5FAV"
  crunchybridge_hobby_2_plan_id    = "hobby-2"
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
    condition     = length(output.candidate_inventory.fly.service_specs) == 4
    error_message = "The Fly handoff must contain exactly four singleton specs."
  }

  assert {
    condition     = alltrue([for spec in values(output.candidate_inventory.fly.service_specs) : spec.region == "iad" && spec.count == 1 && spec.auto_stop == false])
    error_message = "Every service must remain an always-on singleton in IAD."
  }

  assert {
    condition     = output.candidate_inventory.fly.service_specs["studio-production"].environment.STUDIO_DEPLOYMENT_MODE == "managed" && length(output.candidate_inventory.fly.service_specs["registry-production"].environment) == 0
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
    condition     = contains(output.required_runtime_secret_names, "POSTMARK_SERVER_TOKEN") && contains(output.required_runtime_secret_names, "REGISTRY_POSTMARK_SERVER_TOKEN")
    error_message = "The independent Studio and Registry mail credentials must both be handed off."
  }

  assert {
    condition     = b2_bucket.independent_recovery.bucket_type == "allPrivate" && b2_bucket.independent_recovery.file_lock_configuration[0].default_retention[0].mode == "compliance" && b2_bucket.independent_recovery.file_lock_configuration[0].default_retention[0].period[0].duration == 31
    error_message = "The independent bucket must be private with 31-day compliance retention."
  }
}

run "reject_kms_policy_lockout" {
  command = plan
  override_data {
    target = data.aws_iam_session_context.deployment
    values = { issuer_arn = "arn:aws:iam::000000000000:role/unlisted-deployment" }
  }
  expect_failures = [aws_kms_key.studio_root]
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

run "reject_empty_iam_resource" {
  command = plan
  variables {
    kms_admin_principal_arns = ["arn:aws:iam::000000000000:"]
  }
  expect_failures = [var.kms_admin_principal_arns]
}

run "reject_shared_runtime_identity" {
  command = plan
  variables {
    kms_runtime_decrypt_principal_arns = { production = ["arn:aws:iam::000000000000:role/runtime"], staging = ["arn:aws:iam::000000000000:role/runtime"] }
  }
  expect_failures = [var.kms_runtime_decrypt_principal_arns]
}

run "reject_runtime_administrator" {
  command = plan
  variables {
    kms_admin_principal_arns = ["arn:aws:iam::000000000000:role/production-runtime"]
  }
  expect_failures = [var.kms_admin_principal_arns]
}

run "reject_runtime_wrapper" {
  command = plan
  variables {
    kms_wrapping_principal_arns = { production = ["arn:aws:iam::000000000000:role/production-runtime"], staging = ["arn:aws:iam::000000000000:role/staging-wrapper"] }
  }
  expect_failures = [var.kms_wrapping_principal_arns]
}

run "reject_shared_deployment_id" {
  command = plan
  variables {
    deployment_ids = { production = "studio-production", staging = "studio-production" }
  }
  expect_failures = [var.deployment_ids]
}

run "reject_invalid_deployment_id" {
  command = plan
  variables {
    deployment_ids = { production = "", staging = "studio-staging" }
  }
  expect_failures = [var.deployment_ids]
}

run "reject_unpriced_compute" {
  command = plan
  variables {
    service_resources = { studio-production = { cpu_kind = "performance", cpus = 2, memory_mb = 8192 }, studio-staging = { cpu_kind = "shared", cpus = 1, memory_mb = 512 }, registry-production = { cpu_kind = "shared", cpus = 1, memory_mb = 512 }, registry-staging = { cpu_kind = "shared", cpus = 1, memory_mb = 512 } }
  }
  expect_failures = [var.service_resources]
}

run "reject_unpriced_storage" {
  command = plan
  variables {
    postgres_storage_gb = 1000
  }
  expect_failures = [var.postgres_storage_gb]
}

run "reject_unpriced_plan" {
  command = plan
  variables {
    crunchybridge_hobby_2_plan_id = "standard-64"
  }
  expect_failures = [var.crunchybridge_hobby_2_plan_id]
}

run "reject_shared_wrappers" {
  command = plan
  variables {
    kms_wrapping_principal_arns = { production = ["arn:aws:iam::000000000000:role/wrapper"], staging = ["arn:aws:iam::000000000000:role/wrapper"] }
  }
  expect_failures = [var.kms_wrapping_principal_arns]
}

run "reject_wrapper_admin" {
  command = plan
  variables {
    kms_wrapping_principal_arns = { production = ["arn:aws:iam::000000000000:role/kms-admin"], staging = ["arn:aws:iam::000000000000:role/staging-wrapper"] }
  }
  expect_failures = [var.kms_wrapping_principal_arns]
}

run "reject_absent_hobby_catalogue" {
  command = plan
  override_data {
    target = data.crunchybridge_cloudprovider.aws
    values = {
      plans   = []
      regions = [{ region_id = "us-east-1", region_name = "US East", region_location = "Virginia" }]
    }
  }
  expect_failures = [crunchybridge_cluster.postgres]
}

run "reject_changed_hobby_memory" {
  command = plan
  override_data {
    target = data.crunchybridge_cloudprovider.aws
    values = {
      plans   = [{ plan_id = "hobby-2", plan_name = "Hobby-2", plan_cpu = 1, plan_memory = 1 }]
      regions = [{ region_id = "us-east-1", region_name = "US East", region_location = "Virginia" }]
    }
  }
  expect_failures = [crunchybridge_cluster.postgres]
}

run "reject_unavailable_aws_region" {
  command = plan
  override_data {
    target = data.crunchybridge_cloudprovider.aws
    values = {
      plans   = [{ plan_id = "hobby-2", plan_name = "Hobby-2", plan_cpu = 1, plan_memory = 2 }]
      regions = []
    }
  }
  expect_failures = [crunchybridge_cluster.postgres]
}
