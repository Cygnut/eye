var EyeApi =
{

	// This will calls next(null, data) on the result otherwise next(errorThrown) on error.
	_get: function(next, path, qps) {
		var urlString = path + (qps ? "?" + qps : "");
		
		$.ajax({
			url: urlString,
			dataType: "json"
		})
		.done(function(data, textStatus, jqXHR) {
			next(null, data);
		})
		.fail(function(jqXHR, textStatus, errorThrown) {
			next(errorThrown);
		});
	},
	
	_post: function(next, url, data) {
		$.ajax({
			url: url,
			processData: false,	// don't turn data into a query string put on the url.
			type: "POST",
			data: data
		})
		.done(function(data, textStatus, jqXHR) {
			next(null, data);
		})
		.fail(function(jqXHR, textStatus, errorThrown) {
			next(errorThrown);
		});
	},
	
	_put: function(next, url, data) {
		$.ajax({
			url: url,
			processData: false,	// don't turn data into a query string put on the url.
			type: "PUT",
			data: data
		})
		.done(function(data, textStatus, jqXHR) {
			next(null, data);
		})
		.fail(function(jqXHR, textStatus, errorThrown) {
			next(errorThrown);
		});
	},
	
	_delete: function(next, url) {
		$.ajax({
			url: url,
			type: "DELETE"
		})
		.done(function(data, textStatus, jqXHR) {
			next(null, data);
		})
		.fail(function(jqXHR, textStatus, errorThrown) {
			next(errorThrown);
		});
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