'use strict'

const
	async = require('async'),
	Spawner = require('./Spawner'),
	fs = require('fs-extra'),
	Zip = require('adm-zip'),
	request = require('request'),
	path = require('path'),
	log = require('winston'),
	GitHubApi = require('github'),
	pm2 = require('pm2');


function AppUpdater(appsPath, app)
{
	this.app = app;
	
	this.appDir = path.join(appsPath, this.app.id);
	this.packageJson = path.join(this.appDir, 'package.json');
	this.eyePath = path.join(this.appDir, '.eye');
	this.processName = `eye-${this.app.id}`;
	this.zipPath = path.join(this.appDir, 'dist.zip');
	
	this.github = new GitHubApi({
		// optional args 
		debug: false,
		protocol: "https",
		host: "api.github.com", // should be api.github.com for GitHub 
		//pathPrefix: "/api/v3", // for some GHEs; none for GitHub 
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
AppUpdater.prototype.ensureAppDirectoryExists = function(next)
{
	log.info(`Ensuring app directory exists.`);
	
	// Ensure this path exists.
	log.info(`Ensuring path exists for ${this.app.id} at ${this.appDir}.`);
	fs.ensureDir(this.appDir, function(err) {
		if (err)
			return next(`Failed to create directory ${this.appDir}.`);
		else return next();
	});
}

/*
	next = function(err, eyeFile)
*/
AppUpdater.prototype.getEyeFile = function(next)
{
	log.info(`Loading .eye file from ${this.eyePath}`);
	
	try
	{
		return next(null, fs.readJsonSync(this.eyePath));
	}
	catch (e)
	{
		log.warn(`Failed to read .eye file for app ${this.app.id} - non-fatal.`)
		return next(null);	// Couldn't find/read the .eye file - that's fine - return nothing.
	}
}

/*
	next = function(err, release = {
		name,
		zip,
		id
	})
 */
AppUpdater.prototype.fetchRequiredRelease = function(next)
{
	log.info(`Fetching required release.`);
	
	let buildRelease = function(r) {
		return {
			name: r.name,
			zip: r.zipball_url,
			id: r.id
		};
	}
	
	let repo = this.app.repo;
	
	if (!repo.release.id)
	{
		log.info(`Getting latest release.`);
		
		// Even though this is paginated, it is provided in order from latest to oldest, 
		// so just get the first item. If no items, then no releases exist.
		this.github.repos.getLatestRelease({
			owner: repo.owner,
			repo: repo.name
		}, function(err, release) {
			log.info(`Gotten latest release.`);
			
			if (err) return next(`Failed to get latest release from github for ${repo.owner}/${repo.name} with error ${err}.`);
			//if (!release) return next(`No available latest release for package ${repo.owner}/${repo.name}.`);
			
			return next(null, buildRelease(release));
		});
	}
	else
	{
		log.info(`Getting specific release.`);
		
		// TODO: test this one.
		this.github.repos.getRelease({
			owner: repo.owner,
			repo: repo.name,
			id: repo.release.id
		}, function(err, release) {
			log.info(`Gotten specific release.`);
			
			if (err) return next(`Failed to get specific release ${repo.release.id} from github for ${repo.owner}/${repo.name} with error ${err}.`);
			
			return next(null, buildRelease(release));
		});
	}
}
/*
	next = function(err)
*/
AppUpdater.prototype.installPackage = function(eye, release, next)
{
	log.info(`Installing required package.`);
	
	let prepareDir = function(appDir, eye, next) {
		log.info(`Preparing install directory ${appDir} with cleaning ${eye ? 'off' : 'on'}.`);
		// If there is no existing package, clean up the directory first.
		if (!eye)
			fs.emptyDir(appDir, next);
		else return next();
	}
	
	let download = function(url, dest, next) {
		
		log.info(`Downloading package.`);
		
		// Execute the complete sequence of operations.
		// We want this to truncate any existing file.
		// See http://stackoverflow.com/questions/12906694/fs-createwritestream-does-not-immediately-create-file
		let file = fs.createWriteStream(dest); // The default flag used either creates/truncates. Good :)
		
		request({
			url: url,
			headers: {
				'User-Agent': 'eye'
				}
			})
			.pipe(file)
			.on('error', function(err) {
				return next(`Failed to download from ${url} with error ${err}.`);
			});
		
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
	};
	
	let unzipGithubPackage = function(path, dest, next) {
		
		/*
			Github zips will take the form:
			.
			[owner]-[repo]-[sha]/
				package
			
			So we need to extract that subfolder (essentially the only) to dest.
		*/
		
		
		log.info(`Unzipping package.`);
		try
		{
			// Extract the required package.
			let zip = new Zip(path);
			let dirEntry = zip.getEntries().find(e => e.isDirectory);
			if (!dirEntry)
				return next(`Failed to unzip - no subdirectories found in zip at ${path}.`);
			
			zip.extractEntryTo(dirEntry, dest, false /*maintain entry path*/, true /*overwrite*/);	// this can throw.
			return next();
		}
		catch (err)
		{
			return next(err);
		}
	};
	
	let npmUpdate = function(dir, next) {
		
		log.info(`npm updating package.`);
		
		// npm update updates all installed node_modules, in addition to installing any missing ones.(so it does npm install plus more good stuff)
		// It's not easy to call npm through spawn on Windows. Since npm is a npm.cmd batch file (spawn has issues with PATHEXT). For now, the below works, but is not hidden.
		// Get it to run hidden later!
		let cmd = 'cmd';
		let args = ['/c', 'npm update'];
		
		new Spawner()
			.command(cmd)
			.args(args)
			.cwd(dir)
			.error(function(err) {
				// DON'T CALL NEXT HERE AS OTHERWISE IT WILL BE CALLED TWICE.
				console.log( process.env.PATH );
				log.error(`${cmd} ${args.toString()} in ${dir} terminated with error ${err}`);
			})
			.close(function(code, stdout, stderr)
			{
				log.info(`npm update terminated.`);
				if (code !== 0 || stderr)
					return next(`${cmd} ${args.toString()} in ${dir} terminated with code ${code}, stderr ${stderr}`);
				return next();
			}.bind(this))
			.run();
	};
	
	
	// If there's already a package installed, and it has the matching sha, 
	// then we don't need to do any further installation - we're done.
	log.info(`Current installation at release id=${eye ? eye.release_id : '<none>'}, required release id=${release.id}.`);
	if (eye && eye.release_id === release.id)
		return next();
	
	return async.waterfall([
		function(next) {
				prepareDir(this.appDir, eye, function(err) {
					if (err) return next(`Failed to prepare directory ${this.appDir} with error ${err}.`);
					return next();
				}.bind(this));
			}.bind(this),
		function(next) { 
				download(release.zip, this.zipPath, function(err) {
					if (err) return next(`Failed to download package ${release.zip} with error ${err}.`);
					return next();
				}.bind(this));
			}.bind(this),
		function(next) { 
				unzipGithubPackage(this.zipPath, this.appDir, function(err) {
					if (err) return next(`Failed to unzip github package ${this.zipPath} with error ${err}.`);
					return next();
				}.bind(this));
			}.bind(this),
		function(next) { 
				npmUpdate(this.appDir, function(err) {
					if (err) return next(`Failed to npm update directory ${this.appDir} with error ${err}`);
					return next();
				}.bind(this));
			}.bind(this)
	], 
	function(err, result) {
		return next(err);
	}.bind(this));
}

/*
	next = function(err)
*/
AppUpdater.prototype.updateEyeFile = function(eye, release, next)
{
	log.info(`Updating .eye file.`);
	
	if (!eye)
		eye = {};
	
	eye.release_id = release.id;
	try
	{
		fs.writeJsonSync(this.eyePath, eye);
		return next();
	}
	catch (err)
	{
		return next(`Failed to update .eye file with error ${err}`);
	}
}

/*
	next = function(err)
*/
AppUpdater.prototype.ensureAppRunningInPm2 = function(next)
{
	log.info(`Ensuring app running in pm2.`);
	
	let ensureStarted = function(process, next) {
		let status = process.pm2_env.status;
		log.info(`Process known by pm2 - checking if it needs a restart (status=${status}).`);
		
		// The process is on pm2's list. Ensure it's running. Should use .includes, but only in node>=6
		if (['stopping', 'stopped', 'errored'].find((s) => { return s === status; }))
		{
			log.info(`Process being restarted in pm2.`);
			
			pm2.restart(this.processName, function(err) {
				return next(err && `Failed to restart pm2 process with error ${err}`);
			}.bind(this));
		}
		else return next();
	}.bind(this);
	
	let addToPm2 = function(next) {
		log.info(`Process not known by pm2 - starting it.`);
		
		async.waterfall([
			function(next) {
				fs.readJson(this.packageJson, (err, pkg) => { 
					return next(err && `Failed to load package.json for app with error ${err}`, pkg);
				});
			}.bind(this),
			function(pkg, next)
			{
				log.info(`Process not known by pm2 - starting it.`);
				pm2.start({ name: this.processName, script: pkg.main, cwd: this.appDir }, function(err) { 
					return next(err && `Failed to start pm2 app with error ${err}`); 
				});
			}.bind(this),
			function(next) {
				log.info(`Process not persisted by pm2 - storing it.`);
				pm2.dump((err) => next(err && `Failed to persist pm2 process with error ${err}`));
			}.bind(this)
		], 
		function(err) {
			return next(err);
		});
		
	}.bind(this);
	
	// TODO: We might be able to turn this into a waterfall :)
	
	// Now we just need to ensure that the app is saved and running in pm2.
	
	// Check if the app is in pm2's list.
	//		If not, add it, then start the app.
	//		If it is, then do a restart.
	
	// Connect to a pm2 daemon.
	
	async.waterfall([
		function(next) {
			// Connect to pm2.
			pm2.connect((err) => { 
				return next(err && `Failed to connect to pm2 with error ${err}`);
			});
		}.bind(this),
		function(next) {
			// Get all of pm2s managed processes.
			pm2.list((err, processes) => { 
				return next(err && `Failed to get pm2 processes with error ${err}`, processes);
			});
		}.bind(this),
		function(processes, next) {
			let process = processes.find(function(p) { return p.name === this.processName; }.bind(this));
			
			if (process)
				ensureStarted(process, next);
			else
				addToPm2(next);
		}.bind(this)
	], function(err) {
		// Always disconnect, no matter the result as a catchall.
		pm2.disconnect();
		return next(err);
	}.bind(this));
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
			this.ensureAppDirectoryExists((err) => next(err)); 
			}.bind(this),
		function(next) { 
			this.getEyeFile((err, eye) => next(err, eye)); 
			}.bind(this),
		function(eye, next) { 
			this.fetchRequiredRelease((err, release) => next(err, eye, release)); 
			}.bind(this),
		function(eye, release, next) { 
			this.installPackage(eye, release, (err) => next(err, eye, release)); 
			}.bind(this),
		function(eye, release, next) { 
			this.ensureAppRunningInPm2((err) => next(err, eye, release)); 
			}.bind(this),
		function(eye, release, next) { 
			this.updateEyeFile(eye, release, (err) => next(err)); 
			}.bind(this)
	], 
	function(err) {
		return next(err);
	}.bind(this));
}

module.exports = AppUpdater;