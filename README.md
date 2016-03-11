OpenZWave Provider
=========

NslHome provider for the Staples Connect Hub

## Installation

`git clone https://github.com/nslhome/stapleshub-provider.git`

MongoDB and RabbitMQ configuration should be provided via the environment variables `NSLHOME_MONGO_URL` and `NSLHOME_RABBIT_URL`.

You can optionally use the file `.nslhome.env` to store your configuration.
```
export NSLHOME_MONGO_URL=mongodb://HOST/DATABASE
export NSLHOME_RABBIT_URL=amqp://USERNAME:PASSWORD@HOST
```

## Basic Usage

Provider Config
```
{
    "provider" : "stapleshub-provider",
    "name" : "CONFIG_NAME",
    "config" : {
        "httpProxyPort" : 9001,
        "hubId" : "MAC_ADDRESS_OF_HUB",
        "emailAddress" : "WEBSITE_USERNAME",
        "password" : "WEBSITE_PASSWORD"
    }
}
```

Run as a standalone application

`node stapleshub-provider <CONFIG_NAME>`

Include as a module

`require('stapleshub-provider')(CONFIG_NAME)`

## Release History

1.0.0
* Initial Release