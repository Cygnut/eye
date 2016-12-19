function EyeApi($http)
{
    this.$http = $http;
}

EyeApi.prototype = 
{
	// This will calls next(null, data) on the result otherwise next(errorThrown) on error.
	_get: function(next, path, qps) {
		var urlString = path + (qps ? "?" + qps : "");
		
		return this.$http({
			method: "GET",
			url: urlString,
		}).then(
		function(data) { next(null, data); },
		function(data) { next(1, data); });
	},
	
	_post: function(next, url, data) {
		
		return this.$http({
			method: "POST",
			url: url,
			data: data
		}).then(
		function(data) { next(null, data); },
		function(data) { next(1, data); });
	},
	
	_put: function(next, url, data) {
		return this.$http({
			method: "PUT",
			url: url,
			data: data
		}).then(
		function(data) { next(null, data); },
		function(data) { next(1, data); });
	},
	
	_delete: function(next, url) {
		return this.$http({
			method: "DELETE",
			url: url,
			data: data
		}).then(
		function(data) { next(null, data); },
		function(data) { next(1, data); });
	},
	
	
	
	api: function(next) {
		this._get(next, '/api');
	},
	
	ping: function(next, msg) {
		this._get(next, '/ping', $.param({ 
			msg: msg 
		}));
	},
	
	getMaintenance: function(next) {
		this._get(next, '/config/maintenance');
	},
	
	updateMaintenance: function(data, next) {
		this._post(next, '/config/maintenance', data);
	},
	
	getApps: function(next) {
		this._get(next, '/config/apps');
	},
	
	updateApp: function(next, app) {
		this._put(next, '/config/apps', app);
	},
	
	deleteApp: function(next, id) {
		this._delete(next, '/config/apps/' + id);
	},
	
	deleteInstalledApps: function(next) {
		this._delete(next, '/maintenance/deleteInstalledApps');
	}
};