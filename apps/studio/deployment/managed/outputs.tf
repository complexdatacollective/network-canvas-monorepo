output "candidate_inventory" {
  description = "Non-secret estate inventory. Presence is configuration evidence, not qualification."
  value = {
    jurisdiction = "United States"
    fly = {
      region                 = local.fly_region
      service_specs          = local.fly_machine_specs
      provisioning_supported = false
    }
    postgres = {
      provider            = "Crunchy Bridge on AWS"
      region              = local.aws_region
      cluster_id          = crunchybridge_cluster.postgres.id
      logical_databases   = local.databases
      database_enrollment = "pending-sql-operator-module"
      required_effective_tuning = {
        shared_buffers_bytes    = 1073741824
        app_role_work_mem_bytes = 268435456
      }
    }
    primary_objects = {
      jurisdiction = "us"
      buckets      = { for name, bucket in cloudflare_r2_bucket.primary : name => bucket.name }
    }
    independent_recovery = {
      provider                = "Backblaze B2"
      asserted_account_region = var.b2_region
      bucket_id               = b2_bucket.independent_recovery.id
      object_lock_days        = 31
      server_side_encryption  = "SSE-B2/AES256"
      client_side_encryption  = "required-outside-this-module"
      independent_key_custody = "pending-qualification"
    }
    kms_key_arns = { for name, key in aws_kms_key.studio_root : name => key.arn }
    monitoring = {
      candidate                      = "New Relic Free"
      configuration_supported_here   = false
      required_log_retention_days    = 30
      required_metric_retention_days = 30
      paid_upgrade_allowed           = false
    }
  }
}

output "required_runtime_secret_names" {
  description = "Names only. Values must be injected by the deployment secret store and must not enter Terraform state."
  value = [
    "BETTER_AUTH_SECRET",
    "DATABASE_URL",
    "REGISTRY_AUTH_SECRET",
    "REGISTRY_DATABASE_URL",
    "REGISTRY_OPERATOR_DATABASE_URL",
    "REGISTRY_POSTMARK_SERVER_TOKEN",
    "REGISTRY_S3_ACCESS_KEY_ID",
    "REGISTRY_S3_SECRET_ACCESS_KEY",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "STUDIO_ENCRYPTION_KMS_ACCESS_KEY_ID",
    "STUDIO_ENCRYPTION_KMS_DEPLOYMENT",
    "STUDIO_ENCRYPTION_KMS_KEY_ARN",
    "STUDIO_ENCRYPTION_KMS_SECRET_ACCESS_KEY",
    "STUDIO_ENCRYPTION_KMS_SESSION_TOKEN",
    "STUDIO_ENCRYPTION_KEY_PROVIDER",
    "STUDIO_ENCRYPTION_KEYSET",
    "STUDIO_ENCRYPTION_ROOT_* (one variable for every keyset reference)",
    "STUDIO_MAINTENANCE_DATABASE_URL",
    "STUDIO_METRICS_TOKEN",
  ]
}

output "remaining_modules" {
  value = [
    "Fly Machines API deployment and secret injection (official Terraform provider is archived)",
    "Crunchy SQL operator for four databases, migrations, roles, grants, and effective tuning",
    "R2 scoped S3 credentials, version inventory, replication, and reconciliation workers",
    "B2 scoped application credentials and independently held client-side archive keys",
    "New Relic ingest, retention, alert delivery, and hard usage-stop configuration",
  ]
}
