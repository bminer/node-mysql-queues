var queue = require('../index');

//Create a fake MySQL client
var db = {
	'query': function(sql, input, cb) {
		if(typeof input == "function")
		{
			cb = input;
			input = undefined;
		}
		console.log("Executing " + sql);
		//Simulate a database delay of 1 second
		setTimeout(function() {
			console.log("-------------" + sql + " CB");
			if(cb != null) cb();
		}, 1000);
	}
};

queue(db); //Enable queuing

db.query("1");
db.query("2", function() {
	db.query("2cb 1");
	db.query("2cb 2", function() {
		db.query("2cb 2cb");
	});
});
db.query("3A");

var q1 = db.createQueue();
q1.query("Q1 1");
q1.query("Q1 2", function() {
	db.query("6", function() {
		q1.query("9", function() {
			q1.query("11");
		});
		db.query("8");
		q1.execute();
		q1.query("10");
		db.query("12");
	});
	q1.query("Q1 2cb 1");
	q1.query("Q1 2cb 2", function() {
		q1.query("Q1 2cb 2cb");
	});
});
q1.query("Q1 3");
db.query("3B");
q1.execute();
db.query("4");

//Should do nothing since queue is empty
q1.execute();
q1.execute();
q1.execute();

var q2 = db.createQueue();
q2.query("Q2 1");
q2.query("Q2 2", function() {
	db.query("7");
	q2.query("Q2 2cb 1");
	q2.query("Q2 2cb 2", function() {
		q2.query("Q2 2cb 2cb");
	});
});
q2.query("Q2 3");
q2.execute();
db.query("5");
