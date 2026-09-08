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
  description = "Pinned Hobby-2 plan identity; the provider catalogue must confirm its CPU and memory before provisioning."
  default     = "hobby-2"
  validation {
    condition     = var.crunchybridge_hobby_2_plan_id == jsondecode(file("${path.module}/candidate-sizing.json")).postgres.planId
    error_message = "The PostgreSQL plan must match candidate-sizing.json; other plans require a reviewed sizing and price change."
  }

}

variable "postgres_major_version" {
  type        = number
  default     = 18
  description = "PostgreSQL major supported by the signed release."
  validation {
    condition     = var.postgres_major_version == 18
    error_message = "This candidate targets PostgreSQL 18; other majors require a separate compatibility review."
  }
}

variable "postgres_storage_gb" {
  type        = number
  default     = 20
  description = "Candidate cluster storage; capacity and growth are live qualification gates."
  validation {
    condition     = var.postgres_storage_gb == jsondecode(file("${path.module}/candidate-sizing.json")).postgres.storageGb
    error_message = "PostgreSQL storage must match candidate-sizing.json; growth requires a reviewed capacity and price change."
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
  description = "Trusted KMS administrators, including the IAM principal used by Terraform. Temporary deployment sessions must resolve to one of these roles."
  validation {
    condition     = length(var.kms_admin_principal_arns) > 0 && alltrue([for arn in var.kms_admin_principal_arns : can(regex("^arn:aws:iam::[0-9]{12}:(role|user)/[A-Za-z0-9+=,.@_-]+(/[A-Za-z0-9+=,.@_-]+)*$", arn))])
    error_message = "At least one complete AWS IAM user or role administrator ARN is required."
  }
  validation {
    condition     = length(setintersection(var.kms_admin_principal_arns, toset(flatten([for arns in values(var.kms_runtime_decrypt_principal_arns) : tolist(arns)])))) == 0
    error_message = "Runtime identities must not administer KMS keys."
  }
}

variable "kms_runtime_decrypt_principal_arns" {
  type        = map(set(string))
  description = "Runtime decrypt principals keyed exactly by production and staging."
  validation {
    condition     = length(setsubtract(toset(keys(var.kms_runtime_decrypt_principal_arns)), toset(["production", "staging"]))) == 0 && length(keys(var.kms_runtime_decrypt_principal_arns)) == 2 && alltrue([for arns in values(var.kms_runtime_decrypt_principal_arns) : length(arns) > 0]) && alltrue(flatten([for arns in values(var.kms_runtime_decrypt_principal_arns) : [for arn in arns : can(regex("^arn:aws:iam::[0-9]{12}:(role|user)/[A-Za-z0-9+=,.@_-]+(/[A-Za-z0-9+=,.@_-]+)*$", arn))]]))
    error_message = "Provide production and staging sets containing only AWS IAM principal ARNs."
  }
  validation {
    condition     = try(length(setintersection(var.kms_runtime_decrypt_principal_arns.production, var.kms_runtime_decrypt_principal_arns.staging)) == 0, false)
    error_message = "Production and staging runtime decrypt identities must be disjoint."
  }
}

variable "kms_wrapping_principal_arns" {
  type        = map(set(string))
  description = "Operator wrapping principals keyed exactly by production and staging."
  validation {
    condition     = length(setsubtract(toset(keys(var.kms_wrapping_principal_arns)), toset(["production", "staging"]))) == 0 && length(keys(var.kms_wrapping_principal_arns)) == 2 && alltrue([for arns in values(var.kms_wrapping_principal_arns) : length(arns) > 0]) && alltrue(flatten([for arns in values(var.kms_wrapping_principal_arns) : [for arn in arns : can(regex("^arn:aws:iam::[0-9]{12}:(role|user)/[A-Za-z0-9+=,.@_-]+(/[A-Za-z0-9+=,.@_-]+)*$", arn))]]))
    error_message = "Provide production and staging wrapping-principal sets."
  }
  validation {
    condition     = length(setintersection(toset(flatten([for arns in values(var.kms_wrapping_principal_arns) : tolist(arns)])), toset(flatten([for arns in values(var.kms_runtime_decrypt_principal_arns) : tolist(arns)])))) == 0
    error_message = "Runtime identities must not wrap roots for either environment."
  }
  validation {
    condition     = try(length(setintersection(var.kms_wrapping_principal_arns.production, var.kms_wrapping_principal_arns.staging)) == 0, false)
    error_message = "Production and staging wrapping identities must be disjoint."
  }
  validation {
    condition     = length(setintersection(var.kms_admin_principal_arns, toset(flatten([for arns in values(var.kms_wrapping_principal_arns) : tolist(arns)])))) == 0
    error_message = "Root wrapping identities must not administer KMS keys."
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
  description = "Fly Machine sizes, restricted to the shared reviewed cost candidate."
  validation {
    condition = try(
      toset(keys(var.service_resources)) == toset(keys(jsondecode(file("${path.module}/candidate-sizing.json")).services)) &&
      alltrue([for name, value in var.service_resources :
        value.cpu_kind == jsondecode(file("${path.module}/candidate-sizing.json")).services[name].cpu_kind &&
        value.cpus == jsondecode(file("${path.module}/candidate-sizing.json")).services[name].cpus &&
        value.memory_mb == jsondecode(file("${path.module}/candidate-sizing.json")).services[name].memory_mb
      ]), false
    )
    error_message = "All four services must match candidate-sizing.json; a larger estate requires a reviewed sizing and cost change."
  }
}

variable "deployment_ids" {
  type = object({
    production = string
    staging    = string
  })
  description = "Stable non-secret deployment ids bound into the AWS KMS encryption context."
  validation {
    condition     = var.deployment_ids.production != var.deployment_ids.staging && alltrue([for id in values(var.deployment_ids) : can(regex("^[a-z][a-z0-9-]{0,62}$", id))])
    error_message = "Production and staging require distinct deployment ids of 1-63 lowercase letters, digits, or hyphens starting with a letter."
  }
}
