/* Wraps db.query and exposes function db.createQueue() */
module.exports = function(db, debug) {
	if(debug !== true) debug = false;
	if(debug) console.log("mysql-queues: debug mode enabled.");
	var options = { debug: debug, currentlyExecutingQueue: null, mainQueue: [] };
	var dbQuery = db.query; //The old db.query function
	//Wrap db.query
	db.query = function(sql, params, cb) {
		//Run query if no Queue is running; otherwise, queue it in mainQueue
		if(options.currentlyExecutingQueue == null)
			return dbQuery.apply(db, arguments);
		else
			options.mainQueue.push(arguments);
	}
	//Create a new executable query Queue
	db.createQueue = function() {
		return new Queue(function() {return dbQuery.apply(db, arguments);},	function () {
			options.currentlyExecutingQueue = null;
			//Called when a Queue has completed its processing and main queue should be executed
			while(options.mainQueue.length > 0)
			{
				var item = options.mainQueue.shift(); //Unsure of shift's performance
				if(item instanceof Queue)
				{
					item.execute();
					break; //After the Queue has been executed, the main queue will be resumed
				}
				else
					dbQuery.apply(db, item);
			}
		}, options);
	}
	db.startTransaction = function() {
		return Queue.isNowTransaction(this.createQueue(), function() {return dbQuery.apply(db, arguments);});
	}
}
function Queue(dbQuery, resumeMainQueue, options) {
	this.queue = [];
	this.paused = false;
	/* Add a query to the Queue */
	this.query = function(sql, params, cb) {
		if(typeof params == "function")
		{
			cb = params;
			params = undefined;
		}
		this.queue.push({
			'sql': sql,
			'params': params,
			'cb': cb
		});
		return this; //Chaining :)
	};
	/* Execute all queries on the Queue in order and prevent other queries from executing until
		all queries have been completed.
	*/
	this.execute = function(commit) {
		if(this.paused === true) return this;
		var that = this;
		//If another Queue is currently running, we put this on the mainQueue
		if(options.currentlyExecutingQueue != null && options.currentlyExecutingQueue != this)
			options.mainQueue.push(this);
		else if(that.queue.length > 0)
		{
			options.currentlyExecutingQueue = this;
			//console.log("Executing queue:", options.currentlyExecutingQueue);
			//Run everything in the queue
			var done = 0, total = that.queue.length;
			for(var i in that.queue)
			{
				(function(item) {
					//Execute the query
					try {
						if(item.sql == "COMMIT") delete that.rollback; //Keep 'em honest
						that.lastExecuted = item; //For debugging and convenience
						dbQuery(item.sql, item.params || [], function() {
							if(options.debug && arguments[0] != null)
								console.error("mysql-queues: An error occurred while executing the following " +
									"query:\n\t", item.sql);
							//Execute the original callback first (which may add more queries to this Queue)
							if(item.cb != null)
								item.cb.apply(this, arguments);
							
							//When the entire queue has completed...
							if(++done == total)
								that.execute();
						});
					} catch(e) {
						if(options.debug)
							console.log("mysql-queues: An exception occurred for this query:\n\t",
								item.sql, "\twith parameters:\n\t", item.params);
						throw e;
					}
				})(that.queue[i]);
			}
			that.queue = [];
			//All queued queries are running, but we don't resume the main queue just yet
			//console.log("Queue Complete:", options.currentlyExecutingQueue);
		}
		else if(options.currentlyExecutingQueue == this) {
			if(commit) {
				dbQuery("COMMIT", function() {
					delete that;
					resumeMainQueue();
				});
				return;
			}
		}
		return this; //Chaining :)
	};
	this.pause = function(maxWaitTime) {
		this.paused = true;
		if(maxWaitTime > 0)
		{
			var that = this;
			that.pauseTimer = setTimeout(function() {
				that.resume();
			}, maxWaitTime);
		}
		return this; //Chaining
	}
	this.resume = function(commit) {
		if(this.pauseTimer)
			clearTimeout(this.pauseTimer);
		this.paused = false;
		this.execute(commit || false);
		return this; //Chaining
	}
}
Queue.isNowTransaction = function(q, dbQuery) {
	q.query("START TRANSACTION");
	q.commit = function(cb) {
		delete this.commit;
		delete this.rollback;
		this.resume(true);
	}
	q.rollback = function(cb) {
		this.queue = [];
		delete this.commit;
		delete this.rollback;
		dbQuery("ROLLBACK", cb);
		this.resume();
	}
	return q;
}
