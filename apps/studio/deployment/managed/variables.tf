variable "estate_name" {
  type        = string
  description = "Stable lowercase estate prefix used in resource names."
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,30}$", var.estate_name))
    error_message = "estate_name must be 3-31 lowercase letters, digits, or hyphens and start with a letter."
  }
}

variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account containing the four primary R2 buckets."
}

variable "cloudflare_api_token" {
  type        = string
  sensitive   = true
  description = "Workers R2 Storage Write token supplied through TF_VAR_cloudflare_api_token."
}

variable "crunchybridge_application_secret" {
  type        = string
  sensitive   = true
  description = "Crunchy Bridge API secret supplied through TF_VAR_crunchybridge_application_secret."
}

variable "crunchybridge_team_id" {
  type        = string
  description = "Crunchy Bridge team that owns the candidate cluster."
}

variable "crunchybridge_hobby_2_plan_id" {
  type        = string
  description = "Account-visible Hobby-2 plan id; confirm it from the provider data source before planning."
}

variable "postgres_major_version" {
  type        = number
  default     = 18
  description = "PostgreSQL major supported by the signed release."
  validation {
    condition     = var.postgres_major_version == 18
    error_message = "This checkpoint is qualified only against PostgreSQL 18."
  }
}

variable "postgres_storage_gb" {
  type        = number
  default     = 20
  description = "Candidate cluster storage; capacity and growth are live qualification gates."
  validation {
    condition     = var.postgres_storage_gb >= 20
    error_message = "The candidate must allocate at least the separately costed 20 GB baseline."
  }
}

variable "b2_application_key_id" {
  type        = string
  sensitive   = true
  description = "B2 application key id supplied through TF_VAR_b2_application_key_id."
}

variable "b2_application_key" {
  type        = string
  sensitive   = true
  description = "B2 application key supplied through TF_VAR_b2_application_key."
}

variable "b2_endpoint" {
  type        = string
  description = "Native B2 API endpoint for the independently owned US-region account."
  validation {
    condition     = can(regex("^https://api[0-9]*\\.backblazeb2\\.com$", var.b2_endpoint))
    error_message = "Use the official HTTPS native B2 API endpoint for the independently owned account."
  }
}

variable "b2_bucket_name" {
  type        = string
  description = "Globally unique bucket for encrypted independent recovery archives."
}

variable "b2_region" {
  type        = string
  description = "B2 account realm/region reported by the provider; must be proved independently before apply."
  validation {
    condition     = can(regex("^us-[a-z]+-[0-9]{3}$", var.b2_region))
    error_message = "The independent B2 account must report a US region such as us-west-004."
  }
}

variable "kms_admin_principal_arns" {
  type        = set(string)
  description = "Independently controlled AWS principals allowed to administer the two KMS keys."
  validation {
    condition     = length(var.kms_admin_principal_arns) > 0 && alltrue([for arn in var.kms_admin_principal_arns : can(regex("^arn:aws:iam::[0-9]{12}:", arn))])
    error_message = "At least one AWS IAM administrator ARN is required."
  }
}

variable "kms_runtime_decrypt_principal_arns" {
  type        = map(set(string))
  description = "Runtime decrypt principals keyed exactly by production and staging."
  validation {
    condition     = length(setsubtract(toset(keys(var.kms_runtime_decrypt_principal_arns)), toset(["production", "staging"]))) == 0 && length(keys(var.kms_runtime_decrypt_principal_arns)) == 2 && alltrue([for arns in values(var.kms_runtime_decrypt_principal_arns) : length(arns) > 0]) && alltrue(flatten([for arns in values(var.kms_runtime_decrypt_principal_arns) : [for arn in arns : can(regex("^arn:aws:iam::[0-9]{12}:", arn))]]))
    error_message = "Provide production and staging sets containing only AWS IAM principal ARNs."
  }
}

variable "kms_wrapping_principal_arns" {
  type        = map(set(string))
  description = "Operator wrapping principals keyed exactly by production and staging."
  validation {
    condition     = length(setsubtract(toset(keys(var.kms_wrapping_principal_arns)), toset(["production", "staging"]))) == 0 && length(keys(var.kms_wrapping_principal_arns)) == 2 && alltrue([for arns in values(var.kms_wrapping_principal_arns) : length(arns) > 0]) && alltrue(flatten([for arns in values(var.kms_wrapping_principal_arns) : [for arn in arns : can(regex("^arn:aws:iam::[0-9]{12}:", arn))]]))
    error_message = "Provide production and staging wrapping-principal sets."
  }
}

variable "signed_image_references" {
  type = object({
    studio   = string
    registry = string
  })
  description = "Verified immutable image references from the signed combined release manifest."
  validation {
    condition     = alltrue([for ref in values(var.signed_image_references) : can(regex("^[^[:space:]@]+@sha256:[0-9a-f]{64}$", ref))])
    error_message = "Every service image must be an immutable name@sha256:<64 lowercase hex> reference."
  }
}

variable "service_resources" {
  type = map(object({
    cpu_kind  = string
    cpus      = number
    memory_mb = number
  }))
  description = "Qualified Fly Machine sizes for each singleton."
  validation {
    condition     = length(setsubtract(toset(keys(var.service_resources)), toset(["studio-production", "studio-staging", "registry-production", "registry-staging"]))) == 0 && length(keys(var.service_resources)) == 4 && alltrue([for value in values(var.service_resources) : value.cpus >= 1 && value.memory_mb >= 512])
    error_message = "Size all four exact singleton services with at least one CPU and 512 MB."
  }
}

variable "deployment_ids" {
  type = object({
    production = string
    staging    = string
  })
  description = "Stable non-secret deployment ids bound into the AWS KMS encryption context."
}
