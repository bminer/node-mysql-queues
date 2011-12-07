var currentlyExecutingQueue = null;
var mainQueue = [];
/* Wraps db.query and exposes function db.createQueue() */
module.exports = function(db) {
	var dbQuery = db.query; //The old db.query function
	//Wrap db.query
	db.query = function(sql, params, cb) {
		//Run query if no Queue is running; otherwise, queue it in mainQueue
		if(currentlyExecutingQueue == null)
			dbQuery.apply(db, arguments);
		else
			mainQueue.push(arguments);
	}
	//Create a new executable query Queue
	db.createQueue = function() {
		return new Queue(dbQuery, function () {
			//Called when a Queue has completed its processing and main queue should be executed
			currentlyExecutingQueue = null;
			while(mainQueue.length > 0)
			{
				var item = mainQueue.shift(); //Unsure of shift's performance
				if(item instanceof Queue)
				{
					item.execute();
					break; //After the Queue has been executed, the main queue will be resumed
				}
				else
					dbQuery.apply(db, item);
			}
		});
	}
	db.startTransaction = function() {
		return Queue.isNowTransaction(this.createQueue() );
	}
}
function Queue(dbQuery, resumeMainQueue) {
	this.queue = [];
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
	};
	/* Execute all queries on the Queue in order and prevent other queries from executing until
		all queries have been completed.
	*/
	this.execute = function() {
		var that = this;
		//If another Queue is currently running, we put this on the mainQueue
		if(currentlyExecutingQueue != null && currentlyExecutingQueue != this)
			mainQueue.push(this);
		else if(that.queue.length > 0)
		{
			currentlyExecutingQueue = this;
			//console.log("Executing queue:", currentlyExecutingQueue);
			//Run everything in the queue
			var done = 0, total = that.queue.length;
			for(var i in that.queue)
			{
				(function(item) {
					//Execute the query
					dbQuery(item.sql, item.input || [], function() {
						if(item.cb != null)
							item.cb.apply(this, arguments);
						//When the entire queue has completed...
						if(++done == total)
						{
							/* The query's callback may have queued more queries on this Queue.
								If so, execute this Queue again; otherwise, resumeMainQueue() */
							if(that.queue.length == 0)
							{
								//If this is a transaction that has not yet been committed, commit it!
								if(that.commit != null)
									that.commit();
								resumeMainQueue();
							}
							else
								that.execute();
						}
					});
				})(that.queue[i]);
			}
			that.queue = [];
			//All queued queries are running, but we don't resume the main queue just yet
			//console.log("Queue Complete:", currentlyExecutingQueue);
		}
	};
}
Queue.isNowTransaction = function(q) {
	q.query("START TRANSACTION");
	q.commit = function(cb) {
		this.query("COMMIT", cb);
		delete this.commit;
		delete this.rollback;
		this.execute();
	}
	q.rollback = function(cb) {
		this.query("ROLLBACK", cb);
		delete this.commit;
		delete this.rollback;
		this.execute();
	}
	return q;
}
