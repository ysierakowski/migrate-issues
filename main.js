var Migrate = require('./migrate');
var async = require('async');
var child = require('child_proxy').exec;


var deleteAccessToken = "21c5ba2df7d29aa84ed9e959588de9dc5e68269b"

var source = {
	token: "d145f3822bd12ee483e241b2e6cefefe20d5c791",
	repo: "michaelgwelch/test",
};

var dest = {
	token: "d145f3822bd12ee483e241b2e6cefefe20d5c791",
	repo: "michaelgwelch/test2"
};

// delete the dest repo (if it exists)
// Create the dest repo (if it doesn't)
// clone the source repo --mirror
// use sed or awk to update pull to pr in packed-refs
// push --mirror to dest repo

// then start the migration of issues and pulls

var migrate = new Migrate(source, dest);

var allIssues = [];
var allPulls = [];

var allInfo = [];

migrate.getIssueList(function(issues) {
	migrate.getPullList(function(pulls) {

		var i;
		for(i = 0; i < issues.length; i++) {

			var issue = issues[i];
			var issueNumber = issue.number;

			allInfo[issueNumber] = issue;

		}

		for (i = 0; i < pulls.length; i++) {
			var pull = pulls[i];
			var pullNumber = pull.number;

			var issue = allInfo[pullNumber];
			issue.base = pull.base;
			issue.head = pull.head;
		}

		var migratePull = function migratePull(pull, callback) {
			//migrateIssue(pull, callback);
			migrate.createPull(pull, callback);
		}

		var migrateIssue = function migaretIssue(issue, callback) {
			migrate.createIssue(issue, callback);
		}

		var migrateInfo = function migrateInfo(info, callback) {
			if (info.base) {
				migratePull(info, callback);
			} else {
				migrateIssue(info, callback);
			}
		}

		console.dir(allInfo);


		async.eachSeries(allInfo, function(issue, callback) {
			if (issue) {
				migrateInfo(issue, callback);
			} else { 
				callback(); 
			}
		}, function(err) {
			console.log('async error: ' + err);
		});


	}); 
});