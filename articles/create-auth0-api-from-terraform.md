---
title: "Auth0 のAPIをTerraformから作る"
emoji: "✨"
type: "idea" # tech: 技術記事 / idea: アイデア
topics: [Auth0,Terraform]
published: false
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

Auth 0のAPIはauth0_resource_serverから作ります。

```main.tf
resource "auth0_resource_server" "api" {
  name       = "${var.name}-${var.pre_fix}"
  identifier = var.identifier
}

resource "auth0_resource_server_scopes" "api" {
  resource_server_identifier = auth0_resource_server.api.identifier

  dynamic "scopes" {
    for_each = var.scopes
    content {
      name        = scopes.value.name
      description = scopes.value.description
    }
  }
}
```

変数化したいものがあれば別途定義しておきます。

```variables.tf
variable "name" {
  description = "The name of the Auth0 client"
  type        = string
  default     = "sample"
}

variable "identifier" {
  description = "List of callback domains"
  type        = string
  default     = "sample"
}

variable "pre_fix" {
  description = "Prefix for the Auth0 client"
  type        = string
  default     = "test"
}

variable "scopes" {
  description = "The list of permissions for the resource server"
  type = list(object({
    name        = string
    description = string
  }))
  default = [
    {
      name        = "read:data",
      description = "Read data"
    },
    {
      name        = "write:data",
      description = "Write data"
    },
  ]
}
```

あとはAPIを作成して認証します。

```bash
terraform init
```

```bash
terraform apply
```
