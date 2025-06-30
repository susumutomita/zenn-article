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
公式ドキュメントをみると[auth0](https://registry.terraform.io/providers/auth0/auth0/latest/docs)が出しているものと[個人が作成していたようにみえるもの](https://registry.terraform.io/providers/alexkappa/auth0/latest/docs)があるので注意。[後者のレポジトリはアーカイブされているため、](https://github.com/alexkappa/terraform-provider-auth0)使用する際にはAuth0の公式ドキュメントかを確認してください。

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
しかし、Terraformを使用してアプリケーションを作成すると、OIDC Conformantは無効、JWT Signature AlgorithmはHS256として設定されていました。(2023/10/28時点) そのため、これらの設定をTerraform側で指定します。

```main.tf
resource "auth0_client" "application" {
  allowed_logout_urls = var.logout_urls
  app_type            = var.client_app_type
  callbacks           = [for domain in var.callback_domains : "${domain}${var.callback_path}"]
  description         = var.client_description
  jwt_configuration {
    alg                 = var.jwt_alg
    lifetime_in_seconds = var.jwt_lifetime_in_seconds
  }
  name            = "${var.client_name}-${var.pre_fix}"
  oidc_conformant = var.oidc_conformant
}
```

変数化したいものがあれば別途定義しておきます。

```variables.tf
variable "callback_domains" {
  description = "List of callback domains"
  type        = list(string)
  default     = ["http://127.0.0.1:8080", "http://localhost:8080", "http://127.0.0.1:5000", "http://localhost:5000"]
}

variable "callback_path" {
  description = "Callback path"
  type        = string
  default     = "/callback"
}

variable "client_app_type" {
  description = "The type of the Auth0 client app"
  type        = string
  default     = "regular_web"
}

variable "client_description" {
  description = "The description of the Auth0 client"
  type        = string
  default     = "sample app"
}

variable "client_name" {
  description = "The name of the Auth0 client"
  type        = string
  default     = "sample client"
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

variable "logout_urls" {
  description = "List of allowed logout URLs"
  type        = list(string)
  default     = ["http://127.0.0.1:8080/home", "http://localhost:8080/home", "http://127.0.0.1:5000/home", "http://localhost:5000/home"]
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
