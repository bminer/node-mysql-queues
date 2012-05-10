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

queue(db, true);

var trans = db.startTransaction();
trans.query("QUERY 1", function(err, info) {
	if(err) return trans.rollback();
	trans.commit(function() {console.log("COMMIT A");});
	
	console.log("TRANSACTION 1 WAS COMMITTED");
	var trans2 = db.startTransaction();
	trans2.query("QUERY 2", function(err, info) {
		console.log("QUERY 2 CALLBACK JUST GOT CALLED");
		if(err) return trans2.rollback();
		trans2.commit(function() {console.log("COMMIT B");});
		
		var trans3 = db.startTransaction();
		trans3.query("QUERY 3", function(err, info) {
			console.log("QUERY 3 CALLBACK JUST GOT CALLED");
			if(err) return trans2.rollback();
			trans3.commit(function() {console.log("COMMIT C");});
		}).execute();
	}).execute();
}).execute();
