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
    
module.exports.EYE_PREFIX = 'eye.';
    
function AppUpdater(maintenanceConfig, app)
{
    this.app = app;
    
    this.appDir = path.join(maintenanceConfig.appsPath, this.app.id);
    this.packageJson = path.join(this.appDir, 'package.json');
    this.eyePath = path.join(this.appDir, '.eye');
    this.processName = `${module.exports.EYE_PREFIX}${this.app.id}`;
    this.zipPath = path.join(this.appDir, 'dist.zip');
    
    this.githubAuth = maintenanceConfig.repo.auth;
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

(function() {
    
    /*
        next = function(err)
     */
    this.ensureAppDirectoryExists = function(next)
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
    this.getEyeFile = function(next)
    {
        log.info(`Loading .eye file from ${this.eyePath}`);
        
        try
        {
            return next(null, fs.readJsonSync(this.eyePath));
        }
        catch (e)
        {
            log.warn(`Failed to read .eye file for app ${this.app.id} - non-fatal.`)
            return next(null);    // Couldn't find/read the .eye file - that's fine - return nothing.
        }
    }
    
    /*
        next = function(err, release = {
            name,
            zip,
            id
        })
     */
    this.fetchRequiredRelease = function(next)
    {
        let self = this;
        
        log.info(`Fetching required release.`);
        
        // This is a synchronous call to store the authentication to be used for the next call ( and the next call only) to github.
        // We can still GET from github without authentication, but doing so extends the number of calls we can make 
        // to the api (rate limiting) by a lot.
        function authenticateCall()
        {
            self.github.authenticate({
                type: "basic",
                username: self.githubAuth.username,
                password: self.githubAuth.password
            });
        }
        
        function buildRelease(r) {
            return {
                name: r.name,
                zip: r.zipball_url,
                id: r.id
            };
        }
        
        let repo = self.app.repo;
        
        if (!repo.release.id)
        {
            log.info(`Getting latest release.`);
            
            // Even though this is paginated, it is provided in order from latest to oldest, 
            // so just get the first item. If no items, then no releases exist.
            authenticateCall();
            self.github.repos.getLatestRelease({
                owner: repo.owner,
                repo: repo.name
            }, function(err, release) {
                log.info(`Gotten latest release.`);
                
                if (err) 
                    return next(`Failed to get latest release from github for ${repo.owner}/${repo.name} with error ${err}.`);
                
                return next(null, buildRelease(release));
            });
        }
        else
        {
            log.info(`Getting specific release.`);
            
            // TODO: test this one.
            authenticateCall();
            self.github.repos.getRelease({
                owner: repo.owner,
                repo: repo.name,
                id: repo.release.id
            }, function(err, release) {
                log.info(`Gotten specific release.`);
                
                if (err) 
                    return next(`Failed to get specific release ${repo.release.id} from github for ${repo.owner}/${repo.name} with error ${err}.`);
                
                return next(null, buildRelease(release));
            });
        }
    }
    /*
        next = function(err)
    */
    this.installPackage = function(eye, release, next)
    {
        let self = this;
        log.info(`Installing required package.`);
        
        function prepareDir(appDir, eye, next) {
            log.info(`Preparing install directory ${appDir} with cleaning ${eye ? 'off' : 'on'}.`);
            // If there is no existing package, clean up the directory first.
            if (!eye)
                fs.emptyDir(appDir, next);
            else return next();
        }
        
        function download(url, dest, next) {
            
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
        
        function unzipGithubPackage(path, dest, next) {
            
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
                
                zip.extractEntryTo(dirEntry, dest, false /*maintain entry path*/, true /*overwrite*/);    // this can throw.
                return next();
            }
            catch (err)
            {
                return next(err);
            }
        };
        
        function npmUpdate(dir, next) {
            
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
                    log.error(`${cmd} ${args.toString()} in ${dir} terminated with error ${err}`);
                })
                .close(function(code, stdout, stderr)
                {
                    log.info(`npm update terminated.`);
                    if (code !== 0 || stderr)
                        return next(`${cmd} ${args.toString()} in ${dir} terminated with code ${code}, stderr ${stderr}`);
                    return next();
                }.bind(self))
                .run();
        };
        
        
        // If there's already a package installed, and it has the matching sha, 
        // then we don't need to do any further installation - we're done.
        log.info(`Current installation at release id=${eye ? eye.release_id : '<none>'}, required release id=${release.id}.`);
        if (eye && eye.release_id === release.id)
            return next();
        
        return async.waterfall([
            function(next) {
                    prepareDir(self.appDir, eye, function(err) {
                        if (err) return next(`Failed to prepare directory ${self.appDir} with error ${err}.`);
                        return next();
                    });
                },
            function(next) { 
                    download(release.zip, self.zipPath, function(err) {
                        if (err) return next(`Failed to download package ${release.zip} with error ${err}.`);
                        return next();
                    });
                },
            function(next) { 
                    unzipGithubPackage(self.zipPath, self.appDir, function(err) {
                        if (err) return next(`Failed to unzip github package ${self.zipPath} with error ${err}.`);
                        return next();
                    });
                },
            function(next) { 
                    npmUpdate(self.appDir, function(err) {
                        if (err) return next(`Failed to npm update directory ${self.appDir} with error ${err}`);
                        return next();
                    });
                }
        ], 
        function(err, result) {
            return next(err);
        });
    }
    
    /*
        next = function(err)
    */
    this.updateEyeFile = function(eye, release, next)
    {
        log.info(`Updating .eye file.`);
        
        if (!eye)
            eye = {};
        
        eye.release_id = release.id;
        eye.release_name = release.name;    // Include for diagnostic purposes only.
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
    this.ensureAppRunningInPm2 = function(next)
    {
        let self = this;
        log.info(`Ensuring app running in pm2.`);
        
        function ensureStarted(process, next) {
            let status = process.pm2_env.status;
            log.info(`Process known by pm2 - checking if it needs a restart (status=${status}).`);
            
            // The process is on pm2's list. Ensure it's running. Should use .includes, but only in node>=6
            if (['stopping', 'stopped', 'errored'].find((s) => { return s === status; }))
            {
                log.info(`Process being restarted in pm2.`);
                
                pm2.restart(self.processName, function(err) {
                    return next(err && `Failed to restart pm2 process with error ${err}`);
                });
            }
            else return next();
        };
        
        function addToPm2(next) {
            log.info(`Process not known by pm2 - starting it.`);
            
            async.waterfall([
                function(next) {
                    fs.readJson(self.packageJson, (err, pkg) => { 
                        return next(err && `Failed to load package.json for app with error ${err}`, pkg);
                    });
                },
                function(pkg, next)
                {
                    log.info(`Process not known by pm2 - starting it.`);
                    pm2.start({ name: self.processName, script: pkg.main, cwd: self.appDir }, function(err) { 
                        return next(err && `Failed to start pm2 app with error ${err}`); 
                    });
                },
                function(next) {
                    log.info(`Process not persisted by pm2 - storing it.`);
                    pm2.dump((err) => next(err && `Failed to persist pm2 process with error ${err}`));
                }
            ], 
            function(err) {
                return next(err);
            });
            
        };
        
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
                let process = processes.find((p) => p.name === self.processName);
                
                if (process)
                    ensureStarted(process, next);
                else
                    addToPm2(next);
            }
        ], function(err) {
            // Always disconnect, no matter the result as a catchall.
            pm2.disconnect();
            return next(err);
        });
    }
    
    /*
        next = function(err)
    */
    this.run = function(next)
    {
        let self = this;
        /*
            Can we share some vindaloo, sleeping bags, and shampoo,
            Until all the planets collide.
            You can play the wild card, bury your bones in my yard,
            Meet me at the waterslide
            
            Watersliiiiiii-iiiiiiiii-iiide
        */
        async.waterfall([
            function(next) { 
                self.ensureAppDirectoryExists((err) => next(err)); 
                },
            function(next) { 
                self.getEyeFile((err, eye) => next(err, eye)); 
                },
            function(eye, next) { 
                self.fetchRequiredRelease((err, release) => next(err, eye, release)); 
                },
            function(eye, release, next) { 
                self.installPackage(eye, release, (err) => next(err, eye, release)); 
                },
            function(eye, release, next) { 
                self.ensureAppRunningInPm2((err) => next(err, eye, release)); 
                },
            function(eye, release, next) { 
                self.updateEyeFile(eye, release, (err) => next(err)); 
                }
        ], 
        function(err) {
            return next(err);
        });
    }

}).call(AppUpdater.prototype);

module.exports.AppUpdater = AppUpdater;