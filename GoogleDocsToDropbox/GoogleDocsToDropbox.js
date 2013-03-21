/**
 Copyright 2012, Temboo Inc.

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.

  This is a simple Node.js script that demonstrates how to use the Temboo SDK to backup a set of Google Documents files to Dropbox.
  To run the demo, you'll need a Temboo account, and of course Dropbox and Google Docs accounts.

  The demo uses Temboo SDK functions to create a new folder to hold your backups of Dropbox, then retrieves a list of
  Google Documents files for the specified account, downloads each file and then uploads it to the Dropbox folder.

  This script uses one external module: xml2js.  Install it with npm prior to executing this script.

  @author Jimmy Huey
 */


/**********************************************************************************************
* UPDATE THE VALUES OF THESE CONSTANTS WITH YOUR OWN CREDENTIALS
*********************************************************************************************/
// Use these constants to define the set of oAuth credentials that will be used to access Dropbox.
// (Replace with your own Dropbox oAuth credentials.)
	var DROPBOX_APP_KEY = "YOUR DROPBOX APP KEY";
	var DROPBOX_APP_SECRET = "YOUR DROPBOX APP SECRET";
	var DROPBOX_ACCESS_TOKEN = "YOUR DROPBOX OAUTH TOKEN";
	var DROPBOX_ACCESS_TOKEN_SECRET = "YOUR DROPBOX OAUTH TOKEN SECRET";

// Use this constant to define the name of the folder that will be created on Dropbox, and that will hold
// the set of uploaded documents. (Note that another folder with the same name can't already exist on Dropbox.)
	var DROPBOX_BACKUP_FOLDERNAME = "Google_Doc_Backups";

// Use these constants to define the set of credentials that will be used to access Google Documents.
// (Replace with your own Google Docs credentials.)
	var GOOGLEDOCS_USERNAME = "YOUR USERNAME";
	var GOOGLEDOCS_PASSWORD = "YOUR PASSWORD";

// Use these constants to define the set of credentials that will be used to connect with Temboo.
// (Replace with your own Temboo Application Key.)
	var TEMBOO_ACCOUNT_NAME = "YOUR TEMBOO ACCOUNT NAME";
	var TEMBOO_APPLICATIONKEY_NAME = "YOUR APPKEY NAME";
	var TEMBOO_APPLICATIONKEY = "YOUR APPKEY";

/**********************************************************************************************
* END CONSTANTS; NOTHING BELOW THIS POINT SHOULD NEED TO BE CHANGED 
*********************************************************************************************/

//----------------------------------------------------------------------------
// xml2js module
//----------------------------------------------------------------------------
var xml2js = require("xml2js");

//----------------------------------------------------------------------------
// temboo modules
//----------------------------------------------------------------------------
var tembooSessionModule = require("temboo/core/temboosession.js");
var dropBoxModule = require("temboo/Library/Dropbox.js");
var googleDocsModule = require("temboo/Library/Google/Documents.js");
var googleSpreadsheetsModule = require("temboo/Library/Google/Spreadsheets.js");

//----------------------------------------------------------------------------
// Create a new Temboo session, that will be used to run Temboo SDK choreos.
// (Replace with your own Temboo Account Name, Application Key Name, and Application Key key).
//----------------------------------------------------------------------------
var session = new tembooSessionModule.TembooSession(TEMBOO_ACCOUNT_NAME, TEMBOO_APPLICATIONKEY_NAME, TEMBOO_APPLICATIONKEY);

console.log(": session: ");

//----------------------------------------------------------------------------
// Main execution entry point
//----------------------------------------------------------------------------

	createDropBoxFolder();

//----------------------------------------------------------------------------
// Create a folder on Dropbox; after the folder has been created, begin the process of backing up
// Google documents.
//----------------------------------------------------------------------------

function createDropBoxFolder() {

	//----------------------------------------------------------------------------
	// Instantiate the Dropbox.CreateFolder choreo, using the Temboo session object
	// See https://live.temboo.com/library/Library/Dropbox/CreateFolder for detailed documentation
	//----------------------------------------------------------------------------
	console.log(": createFolder: ");

	var createFolderChoreo = new dropBoxModule.CreateFolder(session);

	//----------------------------------------------------------------------------
	// Get an InputSet object for the CreateFolder choreo, and populate the inputs. This choreo takes inputs
	// specifying the name of the folder to create, and Dropbox oAuth credentials
	//----------------------------------------------------------------------------
	var createFolderInput = createFolderChoreo.newInputSet();

	createFolderInput.set_NewFolderName(DROPBOX_BACKUP_FOLDERNAME);

	createFolderInput.set_AppKey(DROPBOX_APP_KEY);
	createFolderInput.set_AppSecret(DROPBOX_APP_SECRET);
	createFolderInput.set_AccessToken(DROPBOX_ACCESS_TOKEN);
	createFolderInput.set_AccessTokenSecret(DROPBOX_ACCESS_TOKEN_SECRET);

	//----------------------------------------------------------------------------
	// Run the "create folder" choreo, to create the new backups folder on Dropbox. (Note that in this case,
	// we don't worry about the results that the choreo returns.)
	//----------------------------------------------------------------------------
	createFolderChoreo.execute(
		createFolderInput,
		// success callback
		function(reply) {
			console.log (": successfully created folder: ");

			copyGoogleDocuments();
		},
		// error callback
		function(error) {
			console.log(": error: ", error);
		}
	);
}

//----------------------------------------------------------------------------
// Begin the backup process by retrieving the set of extant documents from Google Docs
//----------------------------------------------------------------------------

function copyGoogleDocuments() {

	//----------------------------------------------------------------------------
	// Instantiate the Library.Google.Documents.GetAllDocuments choreo.
	// This choreo retrieves all documents (text, spreadsheet and pdf) in the specified Google Documents account
	// See https://live-eng.temboo.com/library/Library/Google/Documents/GetAllDocuments for detailed documentation
	//----------------------------------------------------------------------------
	var getAllDocumentsChoreo = new googleDocsModule.GetAllDocuments(session);

	//----------------------------------------------------------------------------
	// Get an InputSet object for GetAllDocuments, and configure the inputs. This choreo takes inputs
	// specifying the Google Docs credentials to use, and a flag specifying whether we want to get deleted documents in the list
	//----------------------------------------------------------------------------
	getAllDocumentsInput = getAllDocumentsChoreo.newInputSet();
	getAllDocumentsInput.set_Username(GOOGLEDOCS_USERNAME);
	getAllDocumentsInput.set_Password(GOOGLEDOCS_PASSWORD);
	getAllDocumentsInput.set_Deleted(false);

	// Get the list of all documents from Google Docs
	getAllDocumentsChoreo.execute(
		getAllDocumentsInput,
		// success callback
		function(reply) {
			var parser = new xml2js.Parser();

			parser.on('end', function(results) {
				// Upon successful retrieval of the document list, process the documents,
				// downloading each one from Google and uploading it to Dropbox
				processGoogleDocuments(results);
			});

			parser.parseString(reply.get_Response());
		},
		// error callback
		function(error) {
			console.log(": error getting documents: ", error);
		}
	);
}

//----------------------------------------------------------------------------
// Process the set of documents retrieved from Google; parse the result XML
// from Google and, for each document entry, initiate the process of retrieving
// the document content from Google and uploading it to Dropbox.
//----------------------------------------------------------------------------

function processGoogleDocuments(document) {

	// Parse the XML document list returned by Google Docs
	var entry = findTagsByName(document, "entry");
	var links = findTagsByName(document, "content");
	var i, j;
	var list;

	// Iterate through the set of documents
	for (i=0; i<entry.length; i++) {
		var titles = findTagsByName(entry[i], "title");

		var list, linkSrc;

		console.log (": titles: ", titles);

		for (j=0; j<titles.length; j++) {
			list = findTagsByName(links[j], "src");

			linkSrc = list[0];

			console.log (": linkSrc: ", linkSrc);

			// The "linkSrc" attribute of the document listing tells us what kind of document it is. Based
			// on the type of document, run the appropriate choreo to download it.
			
			if (linkSrc.indexOf("securesc") != -1) { // "securesc" means that this is a PDF document, in Google-speak
				console.log (":     pdf: ");

				__execute ("pdf", new googleDocsModule.DownloadBase64EncodedDocument(session));
			}
			if (linkSrc.indexOf("spreadsheet") != -1) {
				console.log (":     spreadsheet: ");

				__execute ("spreadsheet", new googleSpreadsheetsModule.DownloadBase64EncodedSpreadsheet(session));
			}
			if (linkSrc.indexOf("documents") != -1) {
				console.log (":     document: ");

				__execute ("doc", new googleDocsModule.DownloadBase64EncodedDocument(session));
			}
		}
	}

	//----------------------------------------------------------------------------
	// Internal helper function, used to execute the specified choreo, and upload
	// its results to Dropbox
	//----------------------------------------------------------------------------
	
	function __execute (type, choreo) {
		var downloadDocumentChoreo = choreo;
		var downloadDocumentInput;
		var title = titles[j][0];

		// This choreo takes inputs that specify the Google Documents credentials, and the URL of the document to download
		downloadDocumentInput = downloadDocumentChoreo.newInputSet();

		if (type != "spreadsheet") {
			downloadDocumentInput.set_Format(type);
		}
		downloadDocumentInput.set_Link(linkSrc);
		downloadDocumentInput.set_Username(GOOGLEDOCS_USERNAME);
		downloadDocumentInput.set_Password(GOOGLEDOCS_PASSWORD);
		downloadDocumentInput.set_Title("");

		console.log (": loading: ", title);

		// Run the choreo to download the PDF file
		downloadDocumentChoreo.execute(
			downloadDocumentInput,
			function (reply) {
				console.log (": loaded: ", title);

				var fileContents = reply.get_FileContents();

				uploadFileToDropBox(session, fileContents, title);
			},
			function (error) {
				console.log (": error loading: ", title, error);
			}
		);
	}
}

//----------------------------------------------------------------------------
// Upload the specified file to Dropbox
//----------------------------------------------------------------------------

function uploadFileToDropBox(session, fileContents, fileTitle) {

	// Create a Dropbox.UploadFile choreo, that will be used to send the data to Dropbox, using the session object (as always)
	// See https://live.temboo.com/library/Library/Dropbox/UploadFile for detailed documentation

	uploadChoreo = new dropBoxModule.UploadFile(session);

	// Get an InputSet object for Dropbox.UploadFile, and configure it
	uploadInput = uploadChoreo.newInputSet();
	uploadInput.set_Folder(DROPBOX_BACKUP_FOLDERNAME);

	uploadInput.set_AppKey(DROPBOX_APP_KEY);
	uploadInput.set_AppSecret(DROPBOX_APP_SECRET);
	uploadInput.set_AccessToken(DROPBOX_ACCESS_TOKEN);
	uploadInput.set_AccessTokenSecret(DROPBOX_ACCESS_TOKEN_SECRET);

	uploadInput.set_FileContents(fileContents);	// set the file contents
	uploadInput.set_FileName(fileTitle);		// set the file title

	console.log (": uploading: ", fileTitle);

	uploadChoreo.execute(
		uploadInput,
		function (reply) {
			console.log (": upload: complete: ", fileTitle);
		},
		function (error) {
			console.log(": error uploading: ", fileTitle, error);
		}
	);
}


//----------------------------------------------------------------------------
// Internal XML processing function
//----------------------------------------------------------------------------

function findTagsByName(document, tagName) {
	var list = [];
	__findTagsByName(document, tagName, list);
	return list;
}

//----------------------------------------------------------------------------
// Internal XML processing function
//----------------------------------------------------------------------------

function __findTagsByName(document, tagName, list) {
	Object.keys(document).forEach(
		function(key) {
			if (document[key] instanceof Object) {
				__findTagsByName(document[key], tagName, list);
			}

 			if (key == tagName) {
 				list.push (document[key]);
 			}
		}
	);
}

