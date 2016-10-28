

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
	fs = require('fs-extra'),
	path = require('path'),
	log = require('winston'),
	GitHubApi = require('github');

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
	
	
	
this.cmd = path.join(__dirname, "bin", "nircmd.exe")
var appsPath = path.join(__dirname, '../', 'eye-apps');

function download(url, dest) {

  // Execute the complete sequence of operations.
  // We want this to truncate any existing file.
  // See http://stackoverflow.com/questions/12906694/fs-createwritestream-does-not-immediately-create-file
  var file = fs.createWriteStream(dest);

  var request = http.get(url, function (response) {
    response.pipe(file);

    file.on("finish", function() {
      file.close(function () {
        validate();
      });
    });
  });
}

function ensureInstalledUpdatedAndInPm2(pkg)
{
	//ensureInstalled(pkg);
	// Ensure this path exists.
	var dir = path.join(appsPath, pkg.id);
	log.info(`Ensuring path exists for ${pkg.id} at ${dir}.`);
	
	fs.ensureDirSync(dir);
	
	// See if the app is installed there - check for package.json
	var curPkg = path.join(dir, 'package.json');
	var alreadyInstalled = false;
	if (fs.existsSync(curPkg))
	{
		log.info(`A package is present - checking name is correct.`);
		try
		{
			var obj = fs.readJsonSync(curPkg);
			if (pkg.name === obj.name)
				alreadyInstalled = true;
		}
		catch (e)
		{
			// TODO handle this
		}
	}
	
	log.info(`${pkg.id} is ${alreadyInstalled ? '' : 'not'} installed.`);
	
	if (!alreadyInstalled)
	{
		// delete the contents of dir, just to ensure a clean environment
		fs.emptyDirSync(dir);
	}
	
	// TODO: If installed, and required sha is the same as the installed sha, 
	// then we just need to ensure it's in pm2 and started, we don't need to ping github
	
	// So at this point, we either have:
		// alreadyInstalled=false: An empty directory at dir
		// alreadyInstalled=true: An installation of the application at dir
	
	if (alreadyInstalled)
	{
		// get the current git tag of the installation.
		var curTag = pkg.current_tag;
	}
	
	// get the required version to install:
	// if latest - get the latest
	// if a specific version - get that
	
	var requiredTag = {};
	
	if (pkg.latest)
	{
		// Even though this is paginated, it is provided in order from latest to oldest, 
		// so just get the first item. If no items, then no tags exist.
		var tags = github.gitdata.getTags({
			owner: pkg.owner,
			repo: pkg.repo
		}, function(err, result) {});
		
		// TODO: This is wrong - should use async
		
		// TODO: Error if no tags available.
		if (tags.length)
		{
			var t = tags[0];
			requiredTag.name = t.name;
			requiredTag.zip = t.zipball_url;
			requiredTag.sha = t.commit.sha;
		}
	}
	else
	{
		// TODO: test this one.
		var t = github.gitdata.getTag({
			owner: pkg.owner,
			repo: pkg.repo,
			sha: pkg.sha
		}, function(err, result) {});
		
		requiredTag.name = t.name;
		requiredTag.zip = t.zipball_url;
		requiredTag.sha = t.commit.sha;
	}
	
	
	if (requiredTag.sha !== pkg.installed_sha)
	{
		// Need to install/update requiredTag.
		// 
		download(requiredTag.zip, dir);
	}
	
	//ensureUpdated(pkg);
	//ensureInPm2(pkg);
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
};

ensureInstalledUpdatedAndInPm2(pkg);