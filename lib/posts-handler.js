"use strict";

const crypto = require("crypto");
const pug = require("pug");
const Cookies = require("cookies");
const moment = require("moment-timezone");

const util = require("./handler-util");
const Post = require("./post");

//const contents = [];
const trackingIdKey = "tracking_id";

const oneTimeTokenMap = new Map(); // キーをユーザー名、値をトークンとする連想配列

function handle(req, res){

	const cookies = new Cookies(req, res);
	//addTrackingCookie(cookies);
	const trackingId = addTrackingCookie(cookies, req.user);


	switch (req.method){
		case "GET":
			res.writeHead(200, {
				"Content-Type": "text/html; charset = utf-8"
			});

			//res.end(pug.renderFile("./views/posts.pug", {contents}));
			Post.findAll({order:[["id", "DESC"]]}).then((posts) => {
				posts.forEach((post) => {
					post.content = post.content.replace(/\+/g, " ");
					post.formattedCreatedAt = moment(post.createdAt).tz("Asia/Tokyo").format("YYYY年MM月DD日 HH時mm分ss秒");
				});


				const oneTimeToken = crypto.randomBytes(8).toString('hex');
				oneTimeTokenMap.set(req.user, oneTimeToken);


				res.end(pug.renderFile("./views/posts.pug", {
					posts: posts,
					user: req.user,
					oneTimeToken: oneTimeToken
				}));

				console.info(
					`閲覧されました: user: ${req.user}, `+
					`trackingId: ${trackingId}, `+
					`remoteAddress: ${req.connection.remoteAddress}, `+
					`userAgent: ${req.headers["user-agent"]} `
				);
			})
			break;
		case "POST":
			//TODO POSTの処理
			//let body =[];
			let body ="";

			req.on("data", (chunk) =>{
				//body.push(chunk);
				body += chunk;
			}).on("end", () =>{
				//body = Buffer.concat(body).toString();

				const decoded = decodeURIComponent(body);
				const dataArray = decoded.split("&");
				//const content = decoded.split("content=")[1];
				const content = dataArray[0] ? dataArray[0].split("content=")[1] : "";
				const requestedOneTimeToken = dataArray[1] ? dataArray[1].split('oneTimeToken=')[1] : '';

				if(oneTimeTokenMap.get(req.user) === requestedOneTimeToken){
					//正常時の処理
					console.info(`投稿されました: ${content}`);
					//contents.push(content);
					//console.info(`投稿された全内容: ${contents}`);

					Post.create({
						content: content,
						trackingCookie: trackingId,
						postedBy: req.user
					}).then(() => {
						handleRedirectPosts(req, res);
					});	
				} else {
					util.handleBadRequest(req, res);
				}
			});
			break;
		default:
			util.handleBadRequest(req, res);
			break;
	}
}


function handleDelete(req, res){
	switch(req.method){
		case "POST":
			let body = "";
			req.on("data", (chunk) =>{
				body += chunk;
			}).on("end",() => {
				const decoded = decodeURIComponent(body);
				const dataArray = decoded.split("&");
				//const id = decoded.split("=")[1];
				const id = dataArray[0] ? dataArray[0].split("=")[1] : ""
				const requestedOneTimeToken = dataArray[1] ? dataArray[1].split("oneTimeToken=")[1] : "";

				if(oneTimeTokenMap.get(req.user) === requestedOneTimeToken){
					Post.findById(id).then((post) => {
						if(req.user === post.postedBy || req.user === "admin"){
							post.destroy().then(() =>{
								console.info(
									`削除されました: user: ${req.user}, `+
									`remoteAddress: ${req.connection.remoteAddress}, `+
									`userAgent: ${req.headers["user-agent"]} `
								);
								oneTimeTokenMap.delete(req.user);
								handleRedirectPosts(req, res);
							});
						}
					});
				} else {
					util.handleBadRequest(req, res);
				}

				

			});
			break;

		default:
		util.handleBadRequest(req, res);
			break;
	}
}

/*
function addTrackingCookie(cookies){
	if(!cookies.get(trackingIdKey)){
		const trackingId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
		const tomorrow = new Date(Date.now() + (1000 * 60 * 60 * 24));
		cookies.set(trackingIdKey, trackingId, { expires: tomorrow});
	}
}
*/

/*
Cookieに含まれているトラッキングIDに異常がなければその値を返し、
存在しない場合や異常なものである場合には、再度作成しCookieに付与してその値を返す
@param{Cookies} cookies
@param{String} userName
@return {String} トラッキングID
*/

function addTrackingCookie(cookies, userName){
	const requestedTrackingId = cookies.get(trackingIdKey);

	if(isValidTrackingId(requestedTrackingId, userName)){
		return requestedTrackingId;
	}else{
		const originalId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
		const tomorrow = new Date(Date.now() + (1000 * 60 * 60 * 24));
		const trackingId = originalId + '_' + createValidHash(originalId, userName);

		cookies.set(trackingIdKey, trackingId, { expires: tomorrow });

		return trackingId;
	}
}


function isValidTrackingId(trackingId, userName){
	if(!trackingId){
		return false;
	}

	const splitted = trackingId.split('_');
	const originalId = splitted[0];
	const requestedHash = splitted[1];

	return createValidHash(originalId, userName) === requestedHash;
}


const secretKey =
	`4d3f4dbff7ca222432b060583a009bd1860c8c4fa9c7188f0be65fab
	379f5e23f6c0578094dfc3bf7e594b3b235550d4ad54da93cddd50397
	ec3dbeb99d23229b66e637cbddb272c6472433784f88006a1175a449c
	56b9f82e3cd1e5276b359768a70138ee163d4be75380d8f527ca7d33d
	fafec35657f5e9e4198367ca509bb4c01849a813fabd70c5e43f607d8
	88f7191337d0a2689941d4a05ddd41cdd2d30d01092d26b8a1a061660
	8b66f7d3a99d6dfc6dea04a8505b7b1526f9c5ce0927ea9d95aa2cfbc
	274e8b00f035303d3044e662653ce5429cc3a4c368af0df8fcb5a700d
	2bdf8eaec665586b61908e7601725d88313cb37fb30b2d1e61734b684`;

function createValidHash(originalId, userName){
	const sha1sum = crypto.createHash('sha1');
	sha1sum.update(originalId + userName + secretKey);

	return sha1sum.digest("hex");
}






function handleRedirectPosts(req, res){
	res.writeHead(303, {
		"Location": "/posts"
	});
	res.end();
}


module.exports = {
	handle,
	handleDelete
};