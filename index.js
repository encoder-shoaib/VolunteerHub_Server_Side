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
    // await client.connect();

    const db = client.db("Volunteer_Hub");
    const userCollection = db.collection("users");
    const volunteersCollection = db.collection("volunteer_requests");
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

    // Mock auth check endpoint (replace with actual auth middleware)
    app.get("/auth/check", async (req, res) => {
      const user = await userCollection.findOne({
        email: "john.doe@example.com",
      });
      res.send({ user });
    });

    // ============================
    // POST ENDPOINTS
    // ============================
    app.post("/posts", async (req, res) => {
      const post = {
        ...req.body,
        createdAt: new Date().toISOString(),
      };
      try {
        const result = await postsCollection.insertOne(post);
        res.send({ ...post, _id: result.insertedId });
      } catch (error) {
        console.error("Error creating post:", error);
        res.status(500).send({ error: "Failed to create post" });
      }
    });

    app.get("/posts", async (req, res) => {
      const { limit, sort, search } = req.query;
      const query = search ? { title: { $regex: search, $options: "i" } } : {};
      const options = sort
        ? { sort: { deadline: 1 }, limit: parseInt(limit) || 0 }
        : {};
      try {
        const result = await postsCollection.find(query, options).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching posts:", error);
        res.status(500).send({ error: "Failed to fetch posts" });
      }
    });

    app.get("/posts/:id", async (req, res) => {
      try {
        const post = await postsCollection.findOne({
          _id: new ObjectId(req.params.id),
        });
        if (!post) {
          return res.status(404).send({ error: "Post not found" });
        }
        res.send(post);
      } catch (error) {
        console.error("Error fetching post:", error);
        res.status(500).send({ error: "Failed to fetch post" });
      }
    });

    app.put("/posts/:id", async (req, res) => {
      const postId = req.params.id;
      const updateData = {
        ...req.body,
        updatedAt: new Date().toISOString(),
      };
      try {
        const post = await postsCollection.findOne({
          _id: new ObjectId(postId),
        });
        if (!post) {
          return res.status(404).send({ error: "Post not found" });
        }
        if (post.organizerEmail !== req.body.organizerEmail) {
          return res
            .status(403)
            .send({ error: "Unauthorized to update this post" });
        }
        const result = await postsCollection.updateOne(
          { _id: new ObjectId(postId) },
          { $set: updateData }
        );
        if (result.modifiedCount === 0) {
          return res.status(400).send({ error: "No changes made to the post" });
        }
        res.send({ ...post, ...updateData });
      } catch (error) {
        console.error("Error updating post:", error);
        res.status(500).send({ error: "Failed to update post" });
      }
    });

    app.delete("/posts/:id", async (req, res) => {
      try {
        const post = await postsCollection.findOne({
          _id: new ObjectId(req.params.id),
        });
        if (!post) {
          return res.status(404).send({ error: "Post not found" });
        }
        if (req.query.email && post.organizerEmail !== req.query.email) {
          return res
            .status(403)
            .send({ error: "Unauthorized to delete this post" });
        }
        const result = await postsCollection.deleteOne({
          _id: new ObjectId(req.params.id),
        });
        res.send(result);
      } catch (error) {
        console.error("Error deleting post:", error);
        res.status(500).send({ error: "Failed to delete post" });
      }
    });

    app.get("/my-posts", async (req, res) => {
      const { email } = req.query;
      if (!email) {
        return res.status(400).send({ error: "Email is required" });
      }
      try {
        const posts = await postsCollection
          .find({ organizerEmail: email })
          .sort({ deadline: 1 })
          .toArray();
        res.send(posts);
      } catch (error) {
        console.error("Error fetching user's posts:", error);
        res.status(500).send({ error: "Failed to fetch posts" });
      }
    });

    app.patch("/posts/:id/volunteer", async (req, res) => {
      const { volunteersNeeded } = req.body;
      try {
        const result = await postsCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { volunteersNeeded } }
        );
        res.send(result);
      } catch (error) {
        console.error("Error updating volunteers needed:", error);
        res.status(500).send({ error: "Failed to update post" });
      }
    });

    // ============================
    // VOLUNTEER REQUEST ENDPOINTS
    // ============================
    app.post("/volunteer-requests", async (req, res) => {
      const request = {
        ...req.body,
        createdAt: new Date().toISOString(),
      };
      try {
        const result = await volunteersCollection.insertOne(request);
        res.send({ ...request, _id: result.insertedId });
      } catch (error) {
        console.error("Error creating volunteer request:", error);
        res.status(500).send({ error: "Failed to create volunteer request" });
      }
    });

    app.get("/my-volunteer-requests", async (req, res) => {
      const { email } = req.query;
      if (!email) {
        return res.status(400).send({ error: "Email is required" });
      }
      try {
        const requests = await volunteersCollection
          .find({ volunteerEmail: email })
          .sort({ createdAt: -1 })
          .toArray();
        res.send(requests);
      } catch (error) {
        console.error("Error fetching user's volunteer requests:", error);
        res.status(500).send({ error: "Failed to fetch volunteer requests" });
      }
    });

    app.delete("/volunteer-requests/:id", async (req, res) => {
      try {
        const request = await volunteersCollection.findOne({
          _id: new ObjectId(req.params.id),
        });
        if (!request) {
          return res.status(404).send({ error: "Volunteer request not found" });
        }
        if (
          req.body.volunteerEmail &&
          request.volunteerEmail !== req.body.volunteerEmail
        ) {
          return res
            .status(403)
            .send({ error: "Unauthorized to delete this request" });
        }
        const result = await volunteersCollection.deleteOne({
          _id: new ObjectId(req.params.id),
        });
        res.send(result);
      } catch (error) {
        console.error("Error deleting volunteer request:", error);
        res.status(500).send({ error: "Failed to delete volunteer request" });
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
