

// TODO: Allow configurable check period. Should be quite high - like only once every 10 mins.
// TODO: 

/*
	What does this need to do?
	Phase 1:
		Needs to (for each package listed), 
			ensure it is installed in it's own directory under ../apps
			ensure it is up to date
			ensure that it is being run by pm2
	Phase 2:
		Have a web interface to allow editing of the app config file.
		Check pm2 (globally) installed on startup.
*/

var 
	Spawner = require('./Spawner'),
	fs = require('fs-extra'),
	Zip = require("adm-zip"),
	path = require('path'),
	log = require('winston'),
	GitHubApi = require('github'),
	pm2 = require('pm2');

// Initialise logging.
require('./Logging').init();

var github = new GitHubApi({
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
	
	
	
var appsPath = path.join(__dirname, '../', 'eye-apps');

/*
	next = function(err)
 */
function ensurePackageDirectoryExists(pkg, next)
{
	// Ensure this path exists.
	log.info(`Ensuring path exists for ${pkg.id} at ${pkg.dir()}.`);
	fs.ensureDir(pkg.dir(), function(err) {
		if (err)
		{
			log.error(`Failed to create directory ${pkg.dir()} for package ${pkg.id}`);
			return next(err);
		}
		else return next();
	});
}

/*
	next = function(err, existingPkg)
 */
function checkIfPackageInstalled(pkg, next)
{
	ensurePackageDirectoryExists(function(err) {
		// Check if there is a package present.
		if (err) return next(err);
		
		fs.access(pkg.package_json(), fs.constants.R_OK, function(err) {
			// package.json does not exist in this location - so can't have been installed.
			if (err)
				return next();
			
			try {
				let p = fs.readJsonSync(pkg.package_json());
				if (p.name === pkg.name)
					return next(null, p);
				else
					return next(`Incorrect package located at ${pkg.dir()}`); 
			}
			catch (err) {
				return next(`Failed to load package located at ${pkg.dir()} with error ${err}.`);
			}
		});
	});
}

/*
	next = function(err, existingPkg)
 */
function prepareLocalInstall(pkg, next)
{
	checkIfPackageInstalled(pkg, function(err, existingPkg) {
		if (err) return next(err);
		
		log.info(`${pkg.id} is ${existingPkg ? '' : 'not'} installed.`);
		if (existingPkg)
		{
			// delete the contents of dir, just to ensure a clean environment
			fs.emptyDir(pkg.dir(), function(err) {
				return next(err);
			});
		}
		else 
			return next(err, existingPkg);
	});
}

/*
	next = function(err, tag)
	tag = {
		name,
		zip,
		sha
	}
 */
function getRequiredTag(pkg, next)
{
	var requiredTag = {};
	
	if (pkg.latest)
	{
		// Even though this is paginated, it is provided in order from latest to oldest, 
		// so just get the first item. If no items, then no tags exist.
		github.gitdata.getTags({
			owner: pkg.owner,
			repo: pkg.repo
		}, function(err, tags) {
			if (err) return next(err);
			if (!tags.length) return next('No available tags for package.');
			
			var t = tags[0];
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
		github.gitdata.getTag({
			owner: pkg.owner,
			repo: pkg.repo,
			sha: pkg.sha
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
	next = function(err, output)
*/
function npmUpdate(next)
{
	// npm update updates all installed node_modules, in addition to installing any missing ones.
	// (so it does npm install plus more good stuff)
	var cmd = 'npm';
	var args = 'update';
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
}

/*
	next = function(err)
*/
function download(url, dest, next) {
	// Execute the complete sequence of operations.
	// We want this to truncate any existing file.
	// See http://stackoverflow.com/questions/12906694/fs-createwritestream-does-not-immediately-create-file
	var file = fs.createWriteStream(dest); // The default flag used either creates/truncates. Good :)
	
	var request = http.get(url, function (response) {
		
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
}

function installPackage(pkg, tag, cleanFirst, next)
{
	function install()
	{
		// Download the required package.
		var zipFile = path.join(pkg.dir(), 'dist.zip');
		download(tag.zip, zipFile, function() {
			
			try
			{
				// Extract the required package.
				var zip = new Zip(zipFile);
				zip.extractAllTo(pkg.dir(), true /*Overwrite*/);	// this can throw.
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
	}
	
	return
		cleanFirst
		?
		fs.emptyDir(pkg.dir(), function(err) {
			if (err) return next(err);
			install();
		})
		:
		install();
}

/*
	next = function(err)
*/
function ensureRequiredVersionInstalled(pkg, next)
{
	prepareLocalInstall(pkg, function(err, existingPkg) {
		// So at this point, we either have:
			// existingPkg=null: An empty directory at pkg.dir()
			// existingPkg!=null: An installation of the application at pkg.dir()
		
		// Get required sha.
		getRequiredTag(pkg, function(err, tag) {
			if (err) return next(err);
			
			// If we already have a required version installed, then we're done here.
			if (existingPkg && tag.sha === pkg.installed_sha)
				return next();
			
			// If there is an existing package, don't delete it first.
			// Otherwise clean up the directory first, just in case.
			installPackage(pkg, tag, !existingPkg, function(err) {
				return next(err);
			});
		});
	});
}

function ensureInstalledUpdatedAndInPm2(pkg)
{
	ensureRequiredVersionInstalled(pkg, function(err) {
		// Now we just need to ensure that the app is saved and running in pm2.
		
		// Check if the app is in pm2's list.
		//		If not, add it, then start the app.
		//		If it is, then do a restart.
		
		
		// Connect to a pm2 daemon.
		pm2.connect(function(err) {
			
			if (err)
				return next(err);
			
			pm2.list(function(err, processes) {
				
				let process = processes.find(function(p) {
					return p.name === pkg.process_name();
				});
				
				if (process)
				{
					// The process is on pm2's list. Ensure it's running.
					if (['stopping', 'stopped', 'errored'].includes(process.status))
					{
						pm2.restart(pkg.process_name(), function(err) {
							return next(err);
						});
					}
				}
				else
				{
					let script = null;
					try {
						script = fs.readJsonSync(pkg.package_json()).main;
					}
					catch (err) {
						return next(`Failed to load package.json for app ${pkg.id}`);
					}
					
					
					// The process isn't started, and it's not in pm2's list.
					pm2.start({
						name: pkg.process_name(),
						script: script,
						cwd: pkg.dir()
					}, function(err, process) {
						if (err) return next(err);
						
						// Ensure all listed processes are persisted.
						pm2.dump(function(err, process) {
							if (err) return next(err);
						});
					});
					
					// Now to add it to pm2's list.
				}
			});
		});
		
	});
}

var pkg = {
	id: 'hookshot-server',
		// Must be unique against all other packages. 
		// (Should also ideally contain the name of the app)
		// Used to locate the app on disk uniquely.
	owner: 'Cygnut',
	name: 'test-tags',	// name in package.json
	repo: 'test-tags',	// github repo name (usually the same as name)
	installed_sha: null,	// TODO: Ensure this is updated correctly in our file.
	
	latest: true,	// If true, gets the latest tag.
	sha: ""			// If latest=false, gets the tag with this sha.
	
	dir: function() {
		return path.join(this.appsPath, this.id);
	}
	
	package_json: function() {
		return path.join(dir(), 'package.json');
	}
	
	process_name: function() {
		return `eye-${this.id}`;
	}
};

ensureInstalledUpdatedAndInPm2(pkg);