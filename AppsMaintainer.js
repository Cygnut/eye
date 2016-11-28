'use strict'

var 
	async = require('async'),
	log = require('winston'),
	path = require('path'),
	fs = require('fs-extra'),
	au = require('./AppUpdater'),
	pm2 = require('pm2');

function AppsMaintainer(maintenanceConfig)
{
	this.maintenanceConfig = maintenanceConfig;
}

(function() {
	
	function uninstallUnlistedAppsFromPm2(apps, next)
	{
		function deleteApps(processes, next)
		{
			async.mapSeries(
				processes, 
				function(p, next) {
					pm2.delete(p.name, function(err) {
						if (err) log.error(`Failed to stop process ${p.name} with error ${err}.`);
						else log.info(`Removed app ${p.name} from pm2.`);
						
						return next(err);
					});
				},
				function(err)
				{
					return next(err);
				});
		}
		
		// First find all eye initiated apps in pm2.
		async.waterfall([
			function(next) {
				// Connect to pm2.
				pm2.connect((err) => { 
					return next(err && `Failed to connect to pm2 with error ${err}`);
				});
			},
			function(next) {
				// Get all of pm2s managed processes.
				pm2.list((err, processes) => { 
					return next(err && `Failed to get pm2 processes with error ${err}`, processes);
				});
			},
			function(processes, next) {
				
				let eye = au.EYE_PREFIX;
				
				let unlistedEyeProcesses = processes
					.filter(function(p) {
						// Only look at processes started by eye.
						if (!p.name.startsWith(eye)) return false;
						// Get the app id.
						let id = p.name.substring(eye.length);
						// Only get eye processes not in the config file.
						return !apps.find(function(a) { return a.id === id; });
					});
				
				console.log(unlistedEyeProcesses);
					
				return next(null, unlistedEyeProcesses);
			},
			function(unlistedEyeProcesses, next) {
				deleteApps(unlistedEyeProcesses, next);
			},
			function(next)
			{
				pm2.dump(function(err) { 
					return next(err && `Failed to persist pm2 processes with error ${err}`);
				});
			}
		], function(err) {
			// Always disconnect, no matter the result as a catchall.
			pm2.disconnect();
			return next(err);
		});
	}
	
	function getSubdirs(dir, next)
	{
		return fs.readdir(dir, function(err, files)
		{
			if (err)
				return next(`Failed to read the folder ${dir}.`);
			
			async.map(
				files, 
				// Get stats on each directory entry in parallel.
				function(file, next) {
					let p = path.join(dir, file);
					fs.stat(p, function(err, stats) {
						return next(null, { 
							name: file,
							path: p,
							stats: err ? null : stats	// Trap errors (instead passing null stats)
						});
					});
				},
				// Callback called when all items processed.
				function (err, results) {
					
					if (err)
						return next(`Failed to get directory stats for ${dir} with error ${err}.`);
					
					return next(null, results
						.filter(function(r) { return r.stats && r.stats.isDirectory(); })
						.map(function(r) { 
							return { 
								name: r.name,
								path: r.path
							};
						})
					);
				});
		});
	}
	
	function uninstallUnlistedAppsFromDisk(apps, appsPath, next)
	{
		// First off, find all apps which are installed but are not in the config file.
		return getSubdirs(appsPath, function(err, installedApps) {
			
			if (err) return next(err);
			
			// Get rid of those apps that are listed
			installedApps
				.filter(function(installedApp) {
					// Return true for those elements not in apps. Folder names match app ids.
					return !apps.find(function(a) { return a.id === installedApp.name; });
				})
				.forEach(function(installedApp) {
					
					// For those apps which are installed on disk but are not listed in configuration, delete them on disk.
					fs.remove(installedApp.path, function (err) {
						if (err) return log.error(`Failed to remove no longer installed app with error ${err}`);
						else return log.info(`Removed app ${installedApp.name} from disk.`);
					});
				});
				
			return next();
		});
	}
	
	this.uninstallUnlistedApps = function(apps, next)
	{
		let self = this;
		
		log.info(`Starting to uninstall unlisted apps.`);
		
		async.waterfall([
			function(next) {
				uninstallUnlistedAppsFromPm2(apps, function(err) {
					if (err) log.warn(`Failed to remove unlisted apps from pm2 with error ${err}.`);	// Trap errors.
					return next(err);
				});
			},
			function(next) {
				uninstallUnlistedAppsFromDisk(apps, self.maintenanceConfig.appsPath, function(err) {
					if (err) log.warn(`Failed to remove unlisted apps from disk with error ${err}.`);	// Trap errors.
					return next(err);
				}); 
			}
		], 
		function(err) {
			if (err) log.warn(`Failed to uninstall unlisted apps with error ${err}.`);
			else log.info(`Finished uninstalling unlisted apps.`);
			
			return next(err);
		});
	}
	
	this.installListedApps = function(apps, next)
	{
		let self = this;
		
		log.info(`Starting to install listed apps.`);
		
		async.mapSeries(
			apps, 
			function(app, next) {
				
				log.info(`Starting to maintain app "${app.id}".`);
				
				new au.AppUpdater(self.maintenanceConfig, app).run(function(err) {
					if (err)
						log.error(`Failed to ensure ${app.id} up to date, due to error ${err}.`);
					
					log.info(`Finished maintaining app "${app.id}".`);
					
					return next();	// trap errors to treat apps independently.
				});
			},
			function(err)
			{
				if (err) log.warn(`Failed to install listed apps with error ${err}.`);
				else log.info(`Finished installing listed apps.`);
				
				return next(err);
			});
	}
	
	this.maintain = function(apps, next)
	{
		let self = this;
		
		async.waterfall([
		function(next) {
			self.uninstallUnlistedApps(apps, function(err) {
				if (err) log.warn(`Failed to uninstall unlisted apps with error ${err}.`);
				return next();	// Continue regardless of result.
			});
		},
		function(next) {
			self.installListedApps(apps, next);
		}
		], 
		function(err) {
			return next(err && `Error while maintaining apps ${err}`);
		});
	}
	
}).call(AppsMaintainer.prototype);

module.exports = AppsMaintainer;