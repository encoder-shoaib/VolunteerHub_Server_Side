
const express = require("express");
const cors = require("cors");
const port = process.env.PORT || 5000;
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
//middleware
app.use(cors());
app.use(express.json());
// mongodb code

const uri =`mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mkgqk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server (optional starting in v4.7)
    client.connect();

    const userCollection = client.db("Volunteer_Hub").collection("users");




    // User registration and authentication endpoint also by using google
    app.post("/users", async (req, res) => {
      const user = req.body;

      if (!user.email) {
        return res.status(400).send({ error: "Email is required" });
      }

      try {
        // Check if user already exists
        const existingUser = await userCollection.findOne({
          email: user.email,
        });

        if (existingUser) {
          // Update last login time if user exists
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
          // Create new user if doesn't exist
          const newUser = {
            name: user.name,
            email: user.email,
            photoURL: user.photoURL,
            provider: user.provider || "google", // Track auth provider
            createdAt: new Date().toISOString(),
            lastSignInTime: new Date().toISOString(),
            role: "user", // Default role
          };

          const result = await userCollection.insertOne(newUser);
          return res.send({
            ...newUser,
            _id: result.insertedId,
          });
        }
      } catch (error) {
        console.error("Error handling user:", error);
        return res.status(500).send({ error: "Failed to process user" });
      }
    });


    app.get("/users", async (req, res) => {
      const cursor = userCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });



    // singIn
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






    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get("/", (req, res) => {
  res.send("Volunteer server is running");
});
app.listen(port, () => {
  console.log(`Volunteer server is running on port ${port}`);
});
