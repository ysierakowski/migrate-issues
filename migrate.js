(function _() {
	'use strict';

	var MigrationClient = function(source, dest) {

		var moment = require('moment');
		var rest = require('unirest');
		var sourceApiUrl = (source.options && source.options.url) || "https://api.github.com";
		var sourceRepo = source.repo;
		var sourceProxy = source.proxy;

		var destApiUrl = (dest.options && dest.options.url) || "https://api.github.com";
		var destRepo = dest.repo;

		var _ = require('lodash');

		var getList = function getList(listId, callback) {
			var list = [];

			var getPage = function(pageNumber) {

				var request = rest.get(sourceApiUrl + '/repos/' + sourceRepo + '/' + listId + 
					'?page=' + pageNumber + '&state=all');
				request.headers({
					'Authorization': 'token ' + source.token,
					'user-agent': 'node.js'
				});

				if (source.proxy) {
					request.proxy(sourceProxy);
				}

				request.end(function(response) {
					if (response.error) {
						console.dir(response);
						callback(response.error, []);
					} else if (response.body.length === 0) {
						callback(null, list);
					} else {
						list = list.concat(response.body);
						getPage(pageNumber + 1);
					}
				})

			};

			getPage(1);
		}

		this.getPullList = function(callback) {
			getList('pulls', callback);

		};


		this.getIssueList = function(callback) {
			getList('issues', callback);
		};

		this.getPullCommentList = function(callback) {
			getList('pulls/comments', callback);
		};

		this.getIssueCommentList = function(callback) {
			getList('issues/comments', callback);
		}

		this.getCommitComments = function(callback) {
			getList('comments', callback);
		}

		var suffix = function suffix(issue) {
			var creationMoment = moment(issue.created_at);
			var creation = creationMoment.fromNow() + ' (' + creationMoment.format('MMMM Do YYYY, h:mm:ss a') + ')';
			
			var closing = "";
			if (issue.closed_at) {
				var closingMoment = moment(issue.closed_at);
				closing = closingMoment.fromNow() + ' (' + closingMoment.format('MMMM Do YYYY, h:mm:ss a') + ')';
			}

			var result = '\r\n\r\n*GitHub Import*\r\n' +
					'**Author:** ' + issue.user.login + '\r\n' +
					'**Created:** ' + creation + '\r\n';

			if (closing !== '') {
				result = result + '**Closed:** ' + closing + '\r\n';
			}
			return result;
					// '| created by | create date | close date |\r\n' +
			  //      	'|------------|-------------|------------|\r\n' +
			  //      	'| ' + issue.user.login + ' | ' + issue.created_at + ' | ' + issue.closed_at + ' |';

		}

		var updateIssue = function(issueUpdate, callback) {
			var url = destApiUrl + '/repos/' + destRepo + '/issues/' + issueUpdate.number;
			var request = rest.patch(url)
				.type('json')
				.headers({
					'Authorization': 'token ' + dest.token,
					'user-agent': 'node.js'					
				})
				.send({
					'state':issueUpdate.state
				});

			request.options.ca = dest.ca;
			request.end(function() {
					callback();
				});
		}

		this.createIssue = function(issue, callback) {
			var url = destApiUrl + '/repos/' + destRepo + '/issues';
			var request = rest.post(url)
				.type('json')
				.headers({
					'Authorization': 'token ' + source.token,
					'user-agent': 'node.js'
				})
				.send({
					'title':issue.title,
					'body':issue.body + suffix(issue)
				});

			request.options.ca = dest.ca;
			request.end(function(response) {
					if (issue.state === 'closed') {
						updateIssue(issue, callback);
					} else {
						callback();
					}
				});

		};

		this.createPull = function(pull, callback) {

			// task #1: push the base sha up to a branch
			var url = destApiUrl + '/repos/' + destRepo + '/git/refs';
			var request = rest.post(url)
				.type('json')
				.headers({
					'Authorization': 'token ' + dest.token,
					'user-agent': 'node.js'					
				})
				.send({
					'ref':'refs/heads/pr' + pull.number + 'base',
					'sha':pull.base.sha
				});

			request.options.ca = dest.ca;
			request.end(function(response) {
					if (response.error) {
						console.log("error pushing branch: " + url);
						console.dir(response.error);
						callback();
					} else {
						// task #2: create the pull
						url = destApiUrl + '/repos/' + destRepo + '/pulls';
						var request = rest.post(url)
							.type('json')
							.headers({
								'Authorization': 'token ' + dest.token,
								'user-agent': 'node.js'					
							})
							.send({
								'title':pull.title,
								'body':pull.body + suffix(pull),
								'head':'pr/' + pull.number + '/head',
								'base':'pr' + pull.number + 'base'
							});

						request.options.ca = dest.ca;
						request.end(function(response){
								if (response.error) console.log(response.error);
								else if (pull.state === 'closed') {
									updateIssue(pull, callback);
								} else {
									callback();
								}
							});			
					}
				});

		};


		this.createPullComment = function(pullComment, callback) {
			var pullNumber = pullComment.pull_request_url.split('/').pop();
			var url = destApiUrl + '/repos/' + destRepo + '/pulls/' + pullNumber + '/comments';
			var request = rest.post(url)
				.type('json')
				.headers({
					'Authorization': 'token ' + dest.token,
					'user-agent': 'node.js'						
				})
				.send({
					'body':pullComment.body + suffix(pullComment),
					'commit_id':pullComment['original_commit_id'],
					'path':pullComment.path,
					'position':pullComment['original_position']
				});

			request.options.ca = dest.ca;
			request.end(function(response) {
					if (response.error) {
						console.dir(response);
					}
					else {
						console.log("Created comment " + pullComment.body);
						console.log(response.body);
					}
					callback(response.error);
				})
		};

		this.createIssueComment = function(issueComment, callback) {
			var issueNumber = issueComment.issue_url.split('/').pop();
			var url = destApiUrl + '/repos/' + destRepo + '/issues/' + issueNumber + '/comments';
			var request = rest.post(url)
				.type('json')
				.headers({
					'Authorization': 'token ' + dest.token,
					'user-agent': 'node.js'						
				})
				.send({
					'body':issueComment.body + suffix(issueComment),
				});

			request.options.ca = dest.ca;
			request.end(function(response) {
					if (response.error) {
						console.log(response.error);
					}
					else {
						console.log("Created comment " + issueComment.body);
						console.log(response.body);
					}
					callback(response.error);
				})			
		};

		this.createCommitComment = function(commitComment, callback) {
			var commitSha = commitComment.commit_id;
			var url = destApiUrl + '/repos/' + destRepo + '/commits/' + commitSha + '/comments';
			var request = rest.post(url)
				.type('json')
				.headers({
					'Authorization': 'token ' + dest.token,
					'user-agent': 'node.js'						
				})
				.send({
					'body':commitComment.body + suffix(commitComment),
					'sha':commitSha,
					'path':commitComment.path,
					'position':commitComment.position
				});

			request.options.ca = dest.ca;
			request.end(function(response) {
					if (response.error) {
						console.log("Error creating commit comment");
						console.log(response.error);
					}
					else {
						console.log("Created comment " + commitComment.body);
						console.log(response.body);
					}
					callback(response.error);
				})				
		}
	};

	module.exports = MigrationClient;

})();