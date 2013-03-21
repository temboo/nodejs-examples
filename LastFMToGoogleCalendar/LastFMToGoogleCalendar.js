/**

 Node.js version 0.8.9

 Copyright 2012, Temboo Inc.
 
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at
 
 http://www.apache.org/licenses/LICENSE-2.0
 
 Unless required by applicable law or agreed to in writing,
 software distributed under the License is distributed on an
 "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,
 either express or implied. See the License for the specific
 language governing permissions and limitations under the License.


 This application demonstrates how to get started building apps that
 integrate Last.fm and Google Calendar. To run the demo, you'll need
 a Temboo account, a Last.fm API Key, and oAuth 2.0 credentials for
 Google Calendar.

 The demo uses Temboo SDK functions to retrieve an XML list of Last.fm
 "events" associated with a list of your favorite bands, extracts the
 artist name, venue, city, and date for each event item, and adds an
 event to your Google Calendar if the event occurs in the city that you
 specify.
 
 This script uses one external module: xml2js.  
 Install it with npm prior to executing this script.
 

*/

/**********************************************************************************************
* UPDATE THE VALUES OF THESE CONSTANTS WITH YOUR OWN CREDENTIALS
*********************************************************************************************/ 

// This constant defines your LastFM API Key
var LAST_FM_API_KEY = 'YOUR LAST FM API KEY';
	
// These constants define the oAuth credentials with which you access your GOOGLE account.
var GOOGLE_CLIENT_ID		= 'YOUR GOOGLE CLIENT ID';
var GOOGLE_CLIENT_SECRET	= 'YOUR GOOGLE CLIENT SECRET';
var GOOGLE_ACCESS_TOKEN		= 'YOUR GOOGLE ACCESS TOKEN';
var GOOGLE_REFRESH_TOKEN	= 'YOUR GOOGLE REFRESH TOKEN';

// Use these constants to define the set of credentials that will be used 
// to connect with Temboo.
var TEMBOO_ACCOUNT_NAME			= 'YOUR TEMBOO ACCOUNT NAME';
var TEMBOO_APPLICATION_KEY_NAME		= 'YOUR TEMBOO APPLICATION KEY NAME';
var TEMBOO_APPLICATION_KEY_VALUE	= 'YOUR TEMBOO APPLICATION KEY VALUE';

// Use this constant to define the name of the Google Calendar that will be used
var GOOGLE_CALENDAR_NAME	= 'YOUR GOOGLE CALENDAR NAME';

// Use these constants to define the band and city of interest
var MY_BAND	= 'YOUR BAND';
var MY_TOWN	= 'YOUR TOWN';

/**********************************************************************************************
* END CONSTANTS; NOTHING BELOW THIS POINT SHOULD NEED TO BE CHANGED 
*********************************************************************************************/ 


//----------------------------------------------------------------------------
// xml2js module
//----------------------------------------------------------------------------
var xml2js = require('xml2js');

//----------------------------------------------------------------------------
// Create a new Temboo session, that will be used to run Temboo SDK choreos.
//---------------------------------------------------------------------------- 
var tsession = require("temboo/core/temboosession");
var session = new tsession.TembooSession(TEMBOO_ACCOUNT_NAME, TEMBOO_APPLICATION_KEY_NAME, TEMBOO_APPLICATION_KEY_VALUE);

//----------------------------------------------------------------------------
// Find and store events for a band in your city
//---------------------------------------------------------------------------- 
searchEvents(MY_BAND, MY_TOWN, LAST_FM_API_KEY, GOOGLE_CALENDAR_NAME);


function searchEvents(band, myTown, lastFmApiKey, calendarName) {
    console.log("Querying LastFM for '" + band + "' shows in " + myTown);

    // Instantiate the choreography, using the session object
    var LastFm = require("temboo/Library/LastFm/Artist");
    var choreo = new LastFm.GetEvents(session);


    // Get an InputSet object for the choreo
    var inputs = choreo.newInputSet();

    // Set inputs
    inputs.set_APIKey(lastFmApiKey);
    inputs.set_Artist(band);

    // Execute choreo
    choreo.execute(inputs, 
        function(reply) {
            var parser = new xml2js.Parser();
            parser.on('end', function(results) {
                processLastFmDocuments(results, myTown, calendarName);
            });
            parser.parseString(reply.get_Response());
        },
        function(error) {
            console.log(": error: ", error);
            process.exit(1);
        });
}

function processLastFmDocuments(result, myTown, calendarName) {
    jsonstring = JSON.stringify(result);
    jsonObj = JSON.parse(jsonstring);

    var count = 0;
    jsonObj.lfm.events[0].event.forEach(function(ev) {
        var city = ev.venue[0].location[0].city[0].toString();
        if (city.toLowerCase() == myTown.toLowerCase()) {
            var event = new Object();
            event["city"] = city;
            event["startDate"] = ev.startDate.toString();
            event["title"] = ev.title.toString();
            event["venue"] = ev.venue[0].name.toString();
            event["desription"] = ev.description[0].toString();
            saveEvent(event, calendarName);
            count++;
        }
    });
    if (count == 0) {
        console.log("No events found in " + myTown);
    }
}

function saveEvent(event, calendarName) {

    // Instantiate the choreography, using the session object
    var Cal = require("temboo/Library/Google/Calendar");
    var choreo = new Cal.SearchCalendarsByName(session);

    // Get an InputSet object for the choreo
    var inputs = choreo.newInputSet();

    // Set inputs
    inputs.set_ClientSecret(GOOGLE_CLIENT_SECRET);
    inputs.set_AccessToken(GOOGLE_ACCESS_TOKEN);
    inputs.set_RefreshToken(GOOGLE_REFRESH_TOKEN);
    inputs.set_ClientID(GOOGLE_CLIENT_ID);
		
    inputs.set_CalendarName(calendarName);

    // Execute choreo
    choreo.execute(inputs, 
        function(reply) {
            console.log("Successfully located calendar " + calendarName);
            storeEvent(reply.get_CalendarId(), event);
        },
        function(error) {
            console.log(": error: ", error);
            process.exit(1);
        }
    );
}

function storeEvent(calendarId, event) {

    // Instantiate the choreography, using the session object
    var Cal = require("temboo/Library/Google/Calendar");
    var choreo = new Cal.CreateEvent(session);

    // Get an InputSet object for the choreo
    var inputs = choreo.newInputSet();

    // Set inputs
    inputs.set_ClientID(GOOGLE_CLIENT_ID);
    inputs.set_ClientSecret(GOOGLE_CLIENT_SECRET);
    inputs.set_AccessToken(GOOGLE_ACCESS_TOKEN);
    inputs.set_RefreshToken(GOOGLE_REFRESH_TOKEN);

    inputs.set_CalendarID(calendarId);

    inputs.set_EventTitle(event['title']);
    inputs.set_EventLocation(event['venue']);
    inputs.set_EventDescription(event['description']);

    // Note that start/end date/time are the same, as we don't know how
    // long the event will take
    var datetime = new Date(Date.parse(event['startDate']));
    var d = datetime.toISOString().substring(0, 10);
    var t = datetime.toTimeString().substring(0, 8);
    inputs.set_StartDate(d);
    inputs.set_StartTime(t);
    inputs.set_EndDate(d);
    inputs.set_EndTime(t);

    // Execute choreo
    choreo.execute(inputs, 
        function(reply) {
            console.log("Successfully added event '" + event['title'] + "' on " + d  + " to calendar");
        },
        function(error) {
            console.log(": error: ", error);
            process.exit(1);
        }
    );
}

