"use strict";
//Database Adapter
var application_id,
	tracking = true;

    //Database Adapter
var dataStore = {
	databaseName: "pushbots_db",
	databaseVersion: 1, 
	datastore: null,
	
	openDB:  function(callback){
		// Database version.
		var version = 1;
		var that = this;
		if(that.datastore)
			return void callback()

		// Open a connection to the datastore.
		var request = indexedDB.open(this.databaseName, this.databaseVersion);

		request.onerror = function(e) {
			// Do something with request.errorCode!
			log("Database error: " + e.target.errorCode);
		};

		request.onsuccess = function(e) {
			that.datastore = e.target.result;	
			// Execute the callback.
			callback();
		};

		// This event is only implemented in recent browsers
		request.onupgradeneeded = function(e) {
			var db = e.target.result;
			// Create a new datastore.
			var store = db.createObjectStore('pushbots_ids', {
				keyPath: 'type'
			});
		};
	},
	fetchItem: function(objectStore, key, callback) {
		var that = this;
		this.openDB(function() {
			var transaction = that.datastore.transaction([objectStore], 'readonly');
			var objStore = transaction.objectStore(objectStore);

			objStore.get(key).onsuccess = callback;		  
		});
	}
};

dataStore.fetchItem("pushbots_ids", "appID", function(e){
	if(e.target.result !== undefined){
		application_id = e.target.result.value;
	}
});

var showPushbotsNotification = function (title, message, payload ) {
	var poll = [];
	
	if(payload.poll){
		message = payload.poll.q ;
		title = "Instant Poll";
		if(getOperatingSystem() === "OSX"){
			title += " â¦¿ Click on More ðŸ‘‡";
		}
		
		payload.icon = false;
		for(var index in payload.poll.a){
			poll.push({action: payload.poll.a[index].id, title: payload.poll.a[index].text})
		}
	}
	
	if(payload.actions){
		if(payload.action1){
			poll.push({action: payload.action1, title: payload.title1})
		}
		if(payload.action2){
			poll.push({action: payload.action2, title: payload.title2})
		}
	}

	var browser = detectBrowser();
	var not_data = {
		icon: (payload.icon)? payload.icon : false,
		image: (payload.image)? payload.image : false,
		body: message,
		actions: (payload.poll)? poll :[],
		data: payload,
		renotify: true,
		priority: (payload.priority)? payload.priority : 0,
		tag: (payload.tag)? payload.tag : false
	};

	if(browser.title.toLowerCase() !== "opera"){
		not_data['requireInteraction'] = (payload.requireInteraction)? payload.requireInteraction : true
	}

    if(getOperatingSystem() === "OSX" && browser.title.toLowerCase() === "chrome" && getOSXversion() >= 15 ){
		not_data['requireInteraction'] = false
    }

	return self.registration.showNotification(title, not_data);
};
 
self.addEventListener('push', function(event) {
	
	var message_data = false;
	
	if (event.data) {
		message_data = event.data.json();
	}
	
	event.waitUntil(self.registration.pushManager.getSubscription()
	.then(function(sub) {
		if(message_data){
			
			var title = message_data.m.title,
			message = message_data.m.body,
			payload = {};
			
			if(message_data.p != undefined)
				payload	= message_data.p;
			
			event.waitUntil(Promise.all([	
				showPushbotsNotification(title, message, payload)
			]));
		}else{
			console.log("Browser doesn't support payload.");
		}
	}));
});
self.addEventListener('notificationclick', function(event) {
	console.log('Notification click: tag ', event.notification.tag);
	// Android doesn't close the notification when you click on it  
	// See: http://crbug.com/463146  
	event.notification.close();
	
	var url = event.notification.data.url;
	var browser = detectBrowser();
	var platform = (browser.title.toLowerCase() === "chrome")? 2 : 3;
	var notification_id = event.notification.data.pb_n_id;
	var poll = event.notification.data.poll;
	var actions = event.notification.data.actions;

	if(actions){
		if (event.action === event.notification.data.action1) {
			clients.openWindow(event.notification.data.action_url1);
		  }
		  else if (event.action === event.notification.data.action2) {
			clients.openWindow(event.notification.data.action_url2);
		  }
	}

	if(poll){
		var poll_id = event.notification.data.poll.id;
		var answer_id = event.action;
		if(poll_id && answer_id){
			dataStore.fetchItem("pushbots_ids", "userid", function(e){
				if (e.target.result != undefined) {
					fetch("https://api.pushbots.com/answered/" + poll_id + "/" + answer_id, {
						method: "post",
						headers: {
							"Content-Type": "application/json",
							'x-pushbots-appid': application_id
						},
						body: JSON.stringify({device_id:e.target.result.value,push_id:event.notification.data.pb_n_id, platform:platform, date:new Date()})
					});
				}
			});
		}
		console.log("poll clicked",poll_id, event.action);
		
		event.waitUntil(Promise.all([	
			showPushbotsNotification("âœ… You have voted!", "ðŸ‘ Thanks a lot!", {})
		]));
	}else{
		if(notification_id && tracking){
			dataStore.fetchItem("pushbots_ids", "userid", function(e){
				if (e.target.result != undefined) {
					fetch("https://api.pushbots.com/2/pushOpened", {
						method: "post",
						headers: {
							"Content-Type": "application/json",
							'x-pushbots-appid': application_id
						},
						body: JSON.stringify({device_id:e.target.result.value,push_id:event.notification.data.pb_n_id, platform:platform, date:new Date()})
					});
				}
			});
		}
		
		// This looks to see if the current is already open and  
		// focuses if it is  
		event.waitUntil(
			clients.matchAll({
				type: 'window'
			})
			.then(function(windowClients) {			
				for (var i = 0; i < windowClients.length; i++) {
					var client = windowClients[i];
					if (client.url === url && 'focus' in client) {
						return client.focus();
					}
				}
				if (clients.openWindow && url) {
					return clients.openWindow(url);
				}
			})
		);
		
	}

});

//Detect browser version and title
function detectBrowser() {
	var ua_other , ua = navigator.userAgent,
	matched_browser = ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || [];

	//Check for Edge browser
	var edge_check = ua.match(/(edge(?=\/))\/?\s*(\d+)/i) || [];
	if ("Edge" === edge_check[1]) {
		return {
			title: edge_check[1],
			ver: edge_check[2]
		}
	}

	//Check for other browsers
	return /trident/i.test(matched_browser[1]) ? (ua_other = /\brv[ :]+(\d+)/g.exec(ua) || [], {
		title: "IE",
		ver: ua_other[1] || ""
	}) : "Chrome" === matched_browser[1] && (ua_other = ua.match(/\bOPR\/(\d+)/), null != ua_other) ? {
		title: "Opera",
		ver: ua_other[1]
	} : (matched_browser = matched_browser[2] ? [matched_browser[1], matched_browser[2]] : [navigator.appName, navigator.appVersion, "-?"], null != (ua_other = ua.match(/version\/(\d+)/i)) && matched_browser.splice(1, 1, ua_other[1]), {
		title: matched_browser[0],
		ver: matched_browser[1]
	})
};

function getOSXversion(){
	var os_version = navigator.userAgent.split(/[._]/).slice(0,3);
	var minor_version = os_version[os_version.length-1];
	return parseInt(minor_version);
}


function getOperatingSystem() {
	var userAgent = navigator.userAgent;
	if ( (userAgent.indexOf('Android') != -1) ) {
		return "Android";
	}
	
	if ( (userAgent.indexOf('Mac OS X') != -1) ) {
		return "OSX";
	}
	
	if ((userAgent.indexOf('iPhone') != -1) || (userAgent.indexOf('iPod') != -1) || (userAgent.indexOf('iPad') != -1)) {
		return "iOS";
	}
	return "";
};
