const
	async = require('async'),
	Spawner = require('./Spawner'),
	fs = require('fs-extra'),
	Zip = require("adm-zip"),
	path = require('path'),
	log = require('winston'),
	GitHubApi = require('github'),
	pm2 = require('pm2');


function AppUpdater(app)
{
	this.app = app;
	
	let appsPath = path.join(__dirname, '../', 'apps');
	this.appDir = path.join(apps_path, this.app.id);
	this.packageJson = path.join(this.appDir, 'package.json');
	this.eyePath = path.join(this.appDir, '.eye');
	this.processName = `eye-${this.app.id}`;
	this.zipPath = path.join(this.appDir, 'dist.zip');
	
	this.github = new GitHubApi({
		// optional args 
		debug: true,
		protocol: "https",
		host: "api.github.com", // should be api.github.com for GitHub 
		pathPrefix: "/api/v3", // for some GHEs; none for GitHub 
		headers: {
			"user-agent": "eye" // GitHub is happy with a unique user agent 
		},
		followRedirects: false, // default: true; there's currently an issue with non-get redirects, so allow ability to disable follow-redirects 
		timeout: 5000
	});	
}

/*
	next = function(err)
 */
AppUpdater.prototype.ensurePackageDirectoryExists = function(next)
{
	// Ensure this path exists.
	log.info(`Ensuring path exists for ${this.app.id} at ${this.appDir}.`);
	fs.ensureDir(this.appDir, function(err) {
		if (err)
		{
			log.error(`Failed to create directory ${this.appDir} for package ${this.app.id}`);
			return next(err);
		}
		else return next();
	});
}

/*
	next = function(err, eyeFile)
*/
AppUpdater.prototype.getCurrentEyeFile = function(next)
{
	try
	{
		return next(null, fs.readJsonSync(this.eyePath));
	}
	catch (e)
	{
		return next(null);	// Couldn't find/read the .eye file - that's fine - return nothing.
	}
}

/*
	next = function(err, tag = {
		name,
		zip,
		sha
	})
 */
AppUpdater.prototype.fetchRequiredTag = function(next)
{
	if (this.app.repo.tag.latest)
	{
		// Even though this is paginated, it is provided in order from latest to oldest, 
		// so just get the first item. If no items, then no tags exist.
		this.github.gitdata.getTags({
			owner: this.app.repo.owner,
			repo: this.app.repo.name
		}, function(err, tags) {
			if (err) return next(err);
			if (!tags.length) return next('No available tags for package.');
			
			let t = tags[0];
			return next(null, {
				name: t.name,
				zip: t.zipball_url,
				sha: t.commit.sha
			});
		});
	}
	else
	{
		// TODO: test this one.
		this.github.gitdata.getTag({
			owner: this.app.repo.owner,
			repo: this.app.repo.name,
			sha: this.app.repo.tag.sha
		}, function(err, t) {
			if (err) return next(err);
			
			return next(null, {
				name: t.name,
				zip: t.zipball_url,
				sha: t.commit.sha
			});
		});
	}
}
/*
	next = function(err)
*/
AppUpdater.prototype.installRequiredPackage = function(eye, tag, next)
{
	npmUpdate = function(next) {
		// npm update updates all installed node_modules, in addition to installing any missing ones.
		// (so it does npm install plus more good stuff)
		let cmd = 'npm';
		let args = 'update';
		new Spawner()
			.command(cmd)
			.args(args)
			.error(function(err) 
			{ 
				return next(err, null);
			}.bind(this))
			.close(function(code, stdout, stderr) 
			{
				if (code !== 0 || stderr)
					return next(`${cmd} ${args.toString()} terminated with code ${code}, stderr ${stderr}`);
				
				return next(null, stdout);
			}.bind(this))
			.run();
	}.bind(this);
	
	download = function(url, dest, next) {
		// Execute the complete sequence of operations.
		// We want this to truncate any existing file.
		// See http://stackoverflow.com/questions/12906694/fs-createwritestream-does-not-immediately-create-file
		let file = fs.createWriteStream(dest); // The default flag used either creates/truncates. Good :)
		
		let request = http.get(url, function (response) {
			
			let statusCode = response.statusCode;
			
			if (statusCode !== 200)
				return next(`Failed to get zip from ${url} with status code ${statusCode}.`);
			
			response.pipe(file);
			
			file.on('error', function(err) {
				file.close(function () {
					return next(err);
				});
			});
			
			file.on('finish', function() {
				file.close(function () {
					return next();
				});
			});
		});
	}.bind(this);
	
	install = function(tag, next) {
		// Download the required package.
		download(tag.zip, this.zipPath, function() {
			
			try
			{
				// Extract the required package.
				let zip = new Zip(zipFile);
				zip.extractAllTo(this.appDir, true /*Overwrite*/);	// this can throw.
				// Now do an npm install in this directory.
				npmUpdate(function(err) {
					if (err)
						return next(err);
					else
						return next();
				});
			}
			catch (err)
			{
				return next(err);
			}
		});
	}.bind(this);
	
	// If there's already a package installed, and it has the matching sha, 
	// then we don't need to do any further installation.
	if (eye && eye.sha === tag.sha)
		return next();
	
	return
		!eye	// If there is no existing package, clean up the directory first.
		?
		fs.emptyDir(this.appDir, function(err) {
			if (err) return next(err);
			install(tag, next);
		})
		:
		install(tag, next);
}

/*
	next = function(err)
*/
AppUpdater.prototype.updateEyeFile = function(eye, tag, next)
{
	eye.sha = tag.sha;
	try
	{
		fs.writeJsonSync(this.eyePath, eye);
		return next();
	}
	catch (err)
	{
		return next(err);
	}
}

/*
	next = function(err)
*/
AppUpdater.prototype.ensureAppRunningInPm2 = function(next)
{
	// Now we just need to ensure that the app is saved and running in pm2.
	
	// Check if the app is in pm2's list.
	//		If not, add it, then start the app.
	//		If it is, then do a restart.
	
	// Connect to a pm2 daemon.
	pm2.connect(function(err) {
		
		if (err)
			return next(err);
		
		pm2.list(function(err, processes) {
			
			if (err)
			{
				pm2.disconnect();
				return next(err);
			}
			
			let process = processes.find(function(p) {
				return p.name === this.processName;
			});
			
			if (process)
			{
				// The process is on pm2's list. Ensure it's running.
				if (['stopping', 'stopped', 'errored'].includes(process.status))
				{
					pm2.restart(this.processName, function(err) {
						pm2.disconnect();
						return next(err);
					});
				}
			}
			else
			{
				let script = null;
				try {
					script = fs.readJsonSync(this.packageJson).main;
				}
				catch (err) {
					pm2.disconnect();
					return next(`Failed to load package.json for app ${this.app.id}`);
				}
				
				// The process isn't started, and it's not in pm2's list.
				pm2.start({
					name: this.processName,
					script: script,
					cwd: this.appDir
				}, function(err, process) {
					if (err) 
					{
						pm2.disconnect();
						return next(err);
					}
					
					// Ensure all listed processes are persisted.
					pm2.dump(function(err, process) {
						pm2.disconnect();
						return next(err);
					});
				});
			}
		});
	});
}

/*
	next = function(err)
*/
AppUpdater.prototype.run = function(next)
{
	/*
		Can we share some vindaloo, sleeping bags, and shampoo,
		Until all the planets collide.
		You can play the wild card, bury your bones in my yard,
		Meet me at the waterslide
		
		Watersliiiiiii-iiiiiiiii-iiide
	*/
	async.waterfall([
		function(next) { 
			ensurePackageDirectoryExists((err) => next(err)); 
			}.bind(this),
		function(next) { 
			getEyeFile((err, eye) => next(eye)); 
			}.bind(this),
		function(eye, next) { 
			fetchRequiredTag((err, tag) => next(err, eye, tag)); 
			}.bind(this),
		function(eye, tag, next) { 
			installRequiredPackage(eye, tag, (err) => next(err, eye, tag)); 
			}.bind(this),
		function(eye, tag, next) { 
			updateEyeFile(eye, tag, (err) => next(err)); 
			}.bind(this),
		function(next) { 
			ensureAppRunningInPm2((err) => next(err)); 
			}.bind(this)
	], 
	function(err, result) {
		return next(err);
	}.bind(this));
}

module.exports = AppUpdater;