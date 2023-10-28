---
title: "Auth0 のアプリケーションをTerraformから作る"
emoji: "✨"
type: "idea" # tech: 技術記事 / idea: アイデア
topics: [Auth0,Terraform]
published: true
---

## 事前準備

[Auth0](https://auth0.com/docs/get-started/auth0-overview)にあるアプリケーションでアクセス権を付与しておく。
TerraformでAuth0の[Provider](https://github.com/auth0/terraform-provider-auth0)を使うにはAuth0のアプリケーションの認証情報を使ってAuth0のTerraformプロバイダーを作る。

### Terraformのファイルたち

```provider.tf
terraform {
  required_version = "= 1.6.2"
  required_providers {
    auth0 = {
      source  = "auth0/auth0"
      version = ">= 1.0.0"
    }
  }
}

provider "auth0" {
  domain        = var.domain
  client_id     = var.client_id
  client_secret = var.client_secret
}
```

CallBack URL、OIDC Conformant、JWT Signature Algorithmの設定を忘れずに行う必要がありました。
手動でアプリケーションを作成した際:OIDC Conformantは有効化されていました。JWT Signature AlgorithmはRS256でした。
しかし、Terraformを使用してアプリケーションを作成すると、OIDC Conformantは無効、JWT Signature AlgorithmはHS256として設定されていました。(2023/10/28時点) そのため、これらの設定をTerraform側で明示的に指定する必要があります。

```main.tf
resource "auth0_client" "application" {
  name            = "${var.client_name}-${var.pre_fix}"
  description     = var.client_description
  app_type        = var.client_app_type
  callbacks       = [for domain in var.callback_domains : "${domain}${var.callback_path}"]
  oidc_conformant = var.oidc_conformant

  jwt_configuration {
    alg                 = var.jwt_alg
    lifetime_in_seconds = var.jwt_lifetime_in_seconds
  }
}

```

変数化したいものがあれば別途定義しておきます。

```variables.tf
variable "client_name" {
  description = "The name of the Auth0 client"
  type        = string
  default     = "sample name"
}

variable "client_description" {
  description = "The description of the Auth0 client"
  type        = string
  default     = "description"
}

variable "client_app_type" {
  description = "The type of the Auth0 client app"
  type        = string
  default     = "regular_web"
}

variable "client_id" {
  description = "The client_id of auth0"
  type        = string
  default     = "sample client id"
}

variable "client_secret" {
  description = "The client secret of auth0"
  type        = string
  default     = "sample client secret"
}

variable "callback_domains" {
  description = "List of callback domains"
  type        = list(string)
  default     = ["http://127.0.0.1:8080", "http://localhost:8080"]
}

variable "callback_path" {
  description = "Callback path"
  type        = string
  default     = "/callback"
}

variable "domain" {
  description = "The domain of auth0"
  type        = string
  default     = "sampledomain.auth0.com"
}

variable "jwt_alg" {
  description = "The algorithm used to sign the JWT"
  type        = string
  default     = "RS256"
}

variable "jwt_lifetime_in_seconds" {
  description = "The lifetime of the JWT in seconds"
  type        = number
  default     = 36000
}

variable "oidc_conformant" {
  description = "Specify if the client is OIDC Conformant"
  type        = bool
  default     = true
}

variable "pre_fix" {
  description = "Prefix for the Auth0 client"
  type        = string
  default     = "test"
}

```

あとはアプリケーションを作成して認証します。
