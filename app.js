const express = require("express");

const app = express();

const { open } = require("sqlite");

const sqlite3 = require("sqlite3");

const path = require("path");

const dbPath = path.join(__dirname, "twitterClone.db");

app.use(express.json());

const bcrypt = require("bcrypt");

const jwt = require("jsonwebtoken");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running  Successfully at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error :${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const convertAllTweetsToResponse = (obj) => {
  return {
    username: obj.username,
    tweet: obj.tweet,
    dateTime: obj.date_time,
  };
};

const convertAllTweetsOfUserToResponse = (obj) => {
  return {
    tweet: obj.tweet,
    likes: obj.likes,
    replies: obj.replies,
    dateTime: obj.date_time,
  };
};

const authenticateToken = (request, response, next) => {
  let jwtToken;

  const authHeader = request.headers["authorization"];

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "secret_token", async (error, payLoad) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

//REGISTER API

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;

  const selectedUserQuery = `SELECT * FROM user WHERE username='${username}';`;

  const dbUser = await db.get(selectedUserQuery);

  if (dbUser === undefined) {
    const hashedPassword = await bcrypt.hash(password, 10);

    if (password.length > 6) {
      const registerNewUser = `INSERT INTO user (username,password,name,gender)
                        
            VALUES ('${username}',  '${hashedPassword}' , '${name}'  , '${gender}' );`;

      await db.run(registerNewUser);
      response.status(200);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//LOGIN API

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const selectedUserQuery = `SELECT * FROM user WHERE username='${username}';`;

  const user = await db.get(selectedUserQuery);

  if (user === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (isPasswordValid === true) {
      const payLoad = { username: username };
      const jwtToken = jwt.sign(payLoad, "secret_token");

      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//GET LATEST 4 TWEETS

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const tweetsQuery = `SELECT username ,tweet ,date_time
                         FROM user NATURAL JOIN tweet
                         WHERE tweet.user_id IN (SELECT following_user_id FROM follower)
                         ORDER BY date_time DESC 
                         LIMIT 4`;

  const tweetsResults = await db.all(tweetsQuery);

  response.send(
    tweetsResults.map((tweet) => convertAllTweetsToResponse(tweet))
  );
});

//GET NAMES OF PEOPLE USER FOLLOWS

app.get("/user/following/", authenticateToken, async (request, response) => {
  const userFollowingNamesQuery = `SELECT name
                                      FROM user
                                      WHERE user_id IN (SELECT following_user_id FROM follower);`;
  const namesList = await db.all(userFollowingNamesQuery);

  response.send(namesList);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const followersNamesQuery = `SELECT name 
                                  FROM user INNER JOIN follower ON user.user_id = follower.following_user_id;
                                 
                                  `;

  const namesOfFollowers = await db.all(followersNamesQuery);

  response.send(namesOfFollowers);
});

//GET SPECIFIC TWEET

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;

  const followingTweetQuery = `SELECT * FROM tweet WHERE tweet_id ='${tweetId}' AND tweet.user_id IN (SELECT following_user_id FROM follower); `;

  const followingUser = await db.get(followingTweetQuery);

  if (followingUser === undefined) {
    response.status(401);

    response.send("Invalid Request");
  } else {
    const getTweetsQuery = `SELECT tweet ,(SELECT COUNT(like_id) FROM like WHERE tweet_id='${tweetId}') AS likes, (SELECT COUNT(reply_id) FROM reply WHERE tweet_id ='${tweetId}') AS replies,date_time FROM tweet 
                             WHERE tweet.tweet_id ='${tweetId}'`;

    const tweet = await db.get(getTweetsQuery);

    response.send(convertAllTweetsOfUserToResponse(tweet));
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;

    const selectedUserQuery = `SELECT * FROM tweet WHERE tweet_id='${tweetId}' AND tweet.user_id IN (SELECT following_user_id FROM follower);`;

    const followingUser = await db.get(selectedUserQuery);

    if (followingUser === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const likedUserQuery = `SELECT username
                                FROM user NATURAL JOIN like 
                                WHERE like.tweet_id ='${tweetId}'
                                AND tweet.user_id IN (SELECT following_user_id FROM follower)
                            
                                `;

      const likedUsers = await db.all(likedUserQuery);

      response.send({
        likes: likedUsers,
      });
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;

    const selectedUserQuery = `SELECT * FROM tweet WHERE tweet_id = '${tweetId} AND tweet.user_id IN (SELECT following_user_id FROM follower);'`;

    const user = await db.get(selectedUserQuery);

    if (user === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const followingUserReplyQuery = `SELECT name ,reply 
                                        FROM user NATURAL JOIN reply
                                       WHERE reply.tweet_id = '${tweetId}' AND user.user_id IN (SELECT following_user_id FROM follower);`;

      const repliesResults = await db.all(followingUserReplyQuery);

      response.send({
        replies: repliesResults,
      });
    }
  }
);

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const tweetsQuery = `SELECT tweet, (SELECT COUNT(like_id) FROM like NATURAL JOIN tweet WHERE tweet.tweet_id == like.tweet_id) AS likes,
                        (SELECT COUNT(reply_id) FROM reply NATURAL JOIN tweet WHERE tweet.tweet_id = reply.tweet_id) AS replies,date_time
                        FROM tweet 
                       `;

  const tweetsResults = await db.all(tweetsQuery);

  response.send(
    tweetsResults.map((tweet) => convertAllTweetsOfUserToResponse(tweet))
  );
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;

  const date = new Date();

  const newDate = `${date.getFullYear()}-${
    date.getMonth() + 1
  }-${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;

  const tweetsLists = `SELECT tweet_id FROM tweet`;

  const usersLists = `SELECT * FROM user`;

  const users = await db.all(usersLists);

  const userId = users.length + 1;

  const tweets = await db.all(tweetsLists);

  const tweetId = tweets.length + 1;

  const insertTweetIntoTable = `INSERT INTO tweet (tweet_id,tweet,date_time) 
                                    VALUES '${tweetId}', '${tweet}' , , '${newDate};`;

  await db.run(insertTweetIntoTable);
  response.send("Created a Tweet");
});

//DELETE TWEET API

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;

    const deleteUserQuery = `SELECT * FROM tweet WHERE  tweet_id='${tweetId}' AND  tweet.user_id  IN (SELECT follower_user_id FROM follower);`;

    const user = await db.all(deleteUserQuery);

    if (user === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const removeTweetQuery = `DELETE FROM tweet WHERE tweet_id ='${tweetId}';`;
      await db.run(removeTweetQuery);
      response.send("Tweet Removed");
    }
  }
);
module.exports = app;
