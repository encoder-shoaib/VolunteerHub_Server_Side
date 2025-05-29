const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mkgqk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db = client.db("Volunteer_Hub");
    const userCollection = db.collection("users");
    const volunteersCollection = db.collection("volunteers");
    const postsCollection = db.collection("posts");

    // ============================
    // USER ENDPOINTS
    // ============================
    app.post("/users", async (req, res) => {
      const user = req.body;
      if (!user.email) {
        return res.status(400).send({ error: "Email is required" });
      }
      try {
        const existingUser = await userCollection.findOne({
          email: user.email,
        });
        if (existingUser) {
          const result = await userCollection.updateOne(
            { email: user.email },
            {
              $set: {
                lastSignInTime: new Date().toISOString(),
                photoURL: user.photoURL || existingUser.photoURL,
                name: user.name || existingUser.name,
              },
            }
          );
          return res.send({
            ...existingUser,
            lastSignInTime: new Date().toISOString(),
            updated: result.modifiedCount > 0,
          });
        } else {
          const newUser = {
            name: user.name,
            email: user.email,
            photoURL: user.photoURL,
            provider: user.provider || "google",
            createdAt: new Date().toISOString(),
            lastSignInTime: new Date().toISOString(),
            role: "user",
          };
          const result = await userCollection.insertOne(newUser);
          return res.send({ ...newUser, _id: result.insertedId });
        }
      } catch (error) {
        console.error("Error handling user:", error);
        res.status(500).send({ error: "Failed to process user" });
      }
    });

    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.patch("/users", async (req, res) => {
      const email = req.body.email;
      const filter = { email };
      const updateDoc = {
        $set: {
          lastSignInTime: req.body?.lastSignInTime,
        },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // ============================
    // POST ENDPOINTS
    // ============================
    app.get("/api/posts", async (req, res) => {
      try {
        const posts = await postsCollection
          .find()
          .sort({ deadline: 1 })
          .limit(6)
          .toArray();
        res.json(posts);
      } catch (error) {
        console.error("[Backend] Error fetching limited posts:", error);
        res.status(500).json({ error: "Failed to fetch posts" });
      }
    });

    app.get("/api/posts/all", async (req, res) => {
      try {
        const posts = await postsCollection
          .find()
          .sort({ deadline: 1 })
          .toArray();
        res.json(posts);
      } catch (error) {
        console.error("[Backend] Error fetching all posts:", error);
        res.status(500).json({ error: "Failed to fetch all posts" });
      }
    });

    app.get("/api/posts/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          console.warn(`[Backend] Invalid post ID format requested: ${id}`);
          return res.status(400).json({ error: "Invalid post ID format" });
        }
        const post = await postsCollection.findOne({ _id: new ObjectId(id) });
        if (!post) {
          console.warn(`[Backend] Post not found for ID: ${id}`);
          return res.status(404).json({ error: "Post not found" });
        }
        res.json(post);
      } catch (error) {
        console.error("[Backend] Error fetching post by ID:", error);
        res.status(500).json({ error: "Failed to fetch post" });
      }
    });

    app.post("/api/posts", async (req, res) => {
      try {
        const newPost = req.body;
        // Ensure new posts always have volunteersNeeded initialized
        if (
          newPost.volunteersNeeded === undefined ||
          newPost.volunteersNeeded === null
        ) {
          newPost.volunteersNeeded = 1; // Default to 1 if not provided, or set to 0 if that's your starting point
        }
        const result = await postsCollection.insertOne(newPost);
        res.status(201).json({ ...newPost, _id: result.insertedId });
      } catch (error) {
        console.error("[Backend] Error creating new post:", error);
        res.status(500).json({ error: "Failed to create post" });
      }
    });

    // ============================
    // VOLUNTEER REGISTRATION ENDPOINTS
    // ============================

    app.get("/api/volunteers", async (req, res) => {
      try {
        const { postId, userEmail } = req.query;

        if (!postId || !userEmail) {
          return res
            .status(400)
            .json({
              error: "postId and userEmail are required query parameters.",
            });
        }

        const exists = await volunteersCollection.findOne({
          postId, // Stored as string in volunteers collection
          userEmail,
        });

        res.json({ exists: !!exists });
      } catch (error) {
        console.error(
          "[Backend] Error checking volunteer registration:",
          error
        );
        res
          .status(500)
          .json({ error: "Failed to check volunteer registration." });
      }
    });

    app.post("/api/volunteers", async (req, res) => {
      const { postId, userId, userName, userEmail } = req.body;
      console.log(
        `[Backend] Attempting to register volunteer for postId: ${postId}, userEmail: ${userEmail}`
      );

      try {
        // Validate postId format before proceeding
        if (!ObjectId.isValid(postId)) {
          console.error(`[Backend] Invalid postId format received: ${postId}`);
          return res
            .status(400)
            .json({ error: "Invalid post ID format provided." });
        }

        const postObjectId = new ObjectId(postId);

        // 1. Fetch the post to check current status and decrement safely
        const postToUpdate = await postsCollection.findOne({
          _id: postObjectId,
        });

        if (!postToUpdate) {
          console.error(`[Backend] Post not found for ID: ${postId}`);
          return res
            .status(404)
            .json({ error: "Volunteer post not found for this ID." });
        }

        if (postToUpdate.volunteersNeeded <= 0) {
          console.log(
            `[Backend] No more volunteers needed for post: ${postId}. Current: ${postToUpdate.volunteersNeeded}`
          );
          return res
            .status(400)
            .json({ error: "No more volunteers needed for this opportunity." });
        }

        // 2. Check for existing volunteer registration to prevent duplicates
        const existingVolunteer = await volunteersCollection.findOne({
          postId, // Stored as string in volunteers collection
          userEmail,
        });

        if (existingVolunteer) {
          console.log(
            `[Backend] User ${userEmail} already registered for post: ${postId}`
          );
          return res
            .status(400)
            .json({ error: "You have already volunteered for this post." });
        }

        // 3. Register the volunteer in the volunteers collection
        const volunteerResult = await volunteersCollection.insertOne({
          postId,
          userId,
          userName,
          userEmail,
          registeredAt: new Date().toISOString(),
        });
        console.log(
          `[Backend] Volunteer ${userEmail} registered for post ${postId}. Inserted ID: ${volunteerResult.insertedId}`
        );

        // 4. Decrement volunteersNeeded in the posts collection
        const updatePostResult = await postsCollection.updateOne(
          { _id: postObjectId },
          { $inc: { volunteersNeeded: -1 } }
        );
        console.log(
          `[Backend] Post update result for ${postId}: ${JSON.stringify(
            updatePostResult
          )}`
        );

        // Important: Fetch the updated post to send the *actual* current count back to the client.
        const updatedPost = await postsCollection.findOne({
          _id: postObjectId,
        });
        const newVolunteersNeeded = updatedPost
          ? updatedPost.volunteersNeeded
          : postToUpdate.volunteersNeeded; // Fallback to original if re-fetch fails

        // ✅ Success Response: Send 201 Created with consistent JSON structure
        res.status(201).json({
          success: true,
          message: "Volunteer registered successfully!",
          registrationId: volunteerResult.insertedId,
          newVolunteersNeeded: newVolunteersNeeded,
        });
      } catch (error) {
        console.error(
          "[Backend] Caught error in /api/volunteers POST handler:",
          error
        );
        // Generic 500 error for unhandled exceptions
        res
          .status(500)
          .json({
            error: "Failed to register volunteer due to a server error.",
          });
      }
    });

    // Ping the DB
    await client.db("admin").command({ ping: 1 });
    console.log("✅ MongoDB connected successfully.");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
  }
}

run().catch(console.dir);

// Root Route
app.get("/", (req, res) => {
  res.send("Volunteer server is running");
});

// Start Server
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
