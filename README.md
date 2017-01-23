![eye icon](https://github.com/Cygnut/eye/blob/master/public/images/EyeIcon-100x100-Transparent.png)
# eye
Node.js application which automatically deploys and updates released GitHub node applications. In addition to having a JSON configuration file to configure how it should work, this can also be configured via its web interface.

# API

### GET /api
Get the most up to date documentation on the API in JSON format.

### GET /ping

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| msg | Query | A string to be sent back to track the ping request. |

Ping the server for availability with a piece of msg data.

### GET /config/maintenance

Get the maintenance slice of the JSON configuration.

### POST /config/maintenance

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| key | Query | The name of the maintenance field to set. |
| value | Query | The value of the maintenance field to be set to. |

Set a specific field in the maintenance slice of the JSON configuration. Documentation on the maintenance element is given in Config.js.

### GET /config/apps

Get the apps slice of the JSON configuration, which dictates which apps are deployed and updated and how.

### PUT /config/apps

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| - | Body | The app JSON to add or update. |

Add or update an app. This will depend on if the passed app.id matches an existing app.id - if so, an update, else an add. The app will then be deployed on the next scheduled maintenance of eye. Documentation on the app element is given in Config.js.

### DELETE /config/apps/{id}

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| id | Path | The id of an app to delete. |

Delete an identified app.

### DELETE /maintenance/deleteInstalledApps

Delete all cached apps to force eye to do a fresh install on the next scheduled maintenance of eye.
