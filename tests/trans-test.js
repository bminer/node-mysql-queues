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
//test1();
//test2();
test3();

function test1() {
//Let's use an async call in the query callback...
var trans = db.startTransaction();
db.query("START");
trans.query("INSERT", function() {
	//Emulate an async operation
	trans.pause(); //try with and without pause() to see the effect
	setTimeout(function() {
		try {
		//You can't use trans here!
		if(Math.random() > 0.5)
		{
			console.log("About to Commit");
			trans.commit(); //implicit resume
		}
		else
		{
			console.log("About to Rollback");
			trans.rollback();
		}
		} catch(e) {console.log(e)}
	}, 20);
}).execute();
db.query("FINALLY");
}

function test2() {
//Let's try another example, without nesting...
var trans2 = db.startTransaction();
function error() {
	if(trans2.rollback)
	{
		console.log("Print once");
		trans2.rollback();
	}
}
trans2.query("1", error);
trans2.query("2", error);
//Note that trans2.execute().commit() is different from trans2.commit()
trans2.commit(); //In this case, COMMIT is queued, not executed immediately
}

function test3() {
	var trans = db.startTransaction();
	function error() {
		if(trans.rollback && Math.random() > 0.5)
			trans.rollback();
	}
	trans.query("INSERT", function(err, info) {
		if(err) error();
		else
		{
			trans.query("UPDATE 1", error);
			trans.query("UPDATE 2", error);
			trans.commit();
		}
	}).execute();
	db.query("FINALLY");
}
