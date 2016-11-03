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


function AppUpdater(app)
{
	this.app = app;
	
	let appsPath = path.join(__dirname, '../', 'apps');
	this.appDir = path.join(appsPath, this.app.id);
	this.packageJson = path.join(this.appDir, 'package.json');
	this.eyePath = path.join(this.appDir, '.eye');
	this.processName = `eye-${this.app.id}`;
	this.zipPath = path.join(this.appDir, 'dist.zip');
	
	this.github = new GitHubApi({
		// optional args 
		debug: true,
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
	log.info(`Loading .eye file`);
	
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
	next = function(err, tag = {
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
		// so just get the first item. If no items, then no tags exist.
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
AppUpdater.prototype.installPackage = function(eye, tag, next)
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
	
	let unzip = function(path, dest, next) {
		
		log.info(`Unzipping package.`);
		try
		{
			// Extract the required package.
			new Zip(path).extractAllTo(dest, true /*Overwrite*/);	// this can throw.
			return next();
		}
		catch (err)
		{
			return next(err);
		}
	};
	
	let npmUpdate = function(dir, next) {
		
		log.info(`npm updating package.`);
		
		// npm update updates all installed node_modules, in addition to installing any missing ones.
		// (so it does npm install plus more good stuff)
		let cmd = 'npm';
		let args = [ 'update' ];
		new Spawner()
			.command(cmd)
			.args(args)
			.options({
				cwd: dir
			})
			.close(function(code, stdout, stderr)
			{
				log.info(`npm update terminated.`);
				if (code !== 0 || stderr)
					return next(`${cmd} ${args.toString()} terminated with code ${code}, stderr ${stderr}`);
				return next();
			}.bind(this))
			.run();
	};
	
	
	// If there's already a package installed, and it has the matching sha, 
	// then we don't need to do any further installation - we're done.
	if (eye && eye.sha === tag.sha)
		return next();
	
	return async.waterfall([
		function(next) {
				prepareDir(this.appDir, eye, function(err) {
					if (err) return next(`Failed to prepare directory ${this.appDir} with error ${err}.`);
					return next();
				}.bind(this));
			}.bind(this),
		function(next) { 
				download(tag.zip, this.zipPath, function(err) {
					if (err) return next(`Failed to download package ${tag.zip} with error ${err}.`);
					return next();
				}.bind(this));
			}.bind(this),
		function(next) { 
				unzip(this.zipPath, this.appDir, function(err) {
					if (err) return next(`Failed to unzip package ${this.zipPath} with error ${err}.`);
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
	
	// Now we just need to ensure that the app is saved and running in pm2.
	
	// Check if the app is in pm2's list.
	//		If not, add it, then start the app.
	//		If it is, then do a restart.
	
	// Connect to a pm2 daemon.
	pm2.connect(function(err) {
		
		if (err)
			return next(`Failed to connect to pm2 with error ${err}`);
		
		pm2.list(function(err, processes) {
			
			if (err)
			{
				pm2.disconnect();
				return next(`Failed to get pm2 processes with error ${err}`);
			}
			
			let process = processes.find(function(p) {
				return p.name === this.processName;
			}.bind(this));
			
			if (process)
			{
				// The process is on pm2's list. Ensure it's running.
				if (['stopping', 'stopped', 'errored'].includes(process.status))
				{
					pm2.restart(this.processName, function(err) {
						pm2.disconnect();
						if (err)
							return next(`Failed to restart pm2 process with error ${err}`);
						else return next();
					}.bind(this));
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
						return next(`Failed to start pm2 app with error ${err}`);
					}
					
					// Ensure all listed processes are persisted.
					pm2.dump(function(err, process) {
						pm2.disconnect();
						if (err)
							return next(`Failed to persist pm2 process with error ${err}`);
						else return next();
					}.bind(this));
				}.bind(this));
			}
		}.bind(this));
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
			this.updateEyeFile(eye, release, (err) => next(err)); 
			}.bind(this),
		function(next) { 
			this.ensureAppRunningInPm2((err) => next(err)); 
			}.bind(this)
	], 
	function(err, result) {
		return next(err);
	}.bind(this));
}

module.exports = AppUpdater;