const { MongoClient } = require('mongodb');
const express = require('express');
const cors = require('cors');
const admin = require("firebase-admin");
const app = express()
const ObjsectId = require('mongodb').ObjectId;
const fileUpload = require('express-fileupload');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const port = process.env.PORT || 5000;

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


// middleware 
app.use(cors());
app.use(express.json());
app.use(fileUpload());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.4wgcq.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

async function verifyToken(req, res, next){
  if(req.headers?.authorization?.startsWith('Bearer ')){
    const token = req.headers.authorization.split(' ')[1];

    try{
      const decodedUser = await admin.auth().verifyIdToken(token);
      req.decodedEmail = decodedUser.email
    }
    catch {

    }
    next();
  }
}

async function run() {
    try {
        await client.connect();   
        const database = client.db("doctors_portals");
        const appointmentsCollaction = database.collection("appointments");
        const usersCollcation = database.collection("users");
        const doctorsCollcation = database.collection("doctors");

        app.get('/appointments', verifyToken,  async (req, res) => {
          const email = req.query.email;
          const date = req.query.date;
          const query = { email: email, date: date};
          const cursor = appointmentsCollaction.find(query);
          const appointments = await cursor.toArray();
          res.json(appointments);
        })

        app.get('/appointments/:id', async (req, res) => {
          const id = req.params.id;
          const query = { _id: ObjsectId(id)};
          const result = await appointmentsCollaction.findOne(query);
          res.json(result);
        })

        app.post('/appointments', async (req, res) => {
          const appointment = req.body;
          const result = await appointmentsCollaction.insertOne(appointment);
          res.json(result);
        })

        app.put('/appointments/:id', async (req, res) => {
          const id = req.params.id;
          const payment = req.body;
          const filter = {_id: ObjsectId(id)};
          const updateDoc = {
            $set: {
              payment: payment
            }
          };
          const result = await appointmentsCollaction.updateOne(filter, updateDoc);
          res.json(result);
        })

        app.get('/doctors', async (req, res) => {
          const cursor = doctorsCollcation.find({});
          const result = await cursor.toArray();
          res.json(result);
        })

        app.post('/doctors', async (req, res) => {
          const name = req.body.name;
          const email = req.body.email;
          const pic = req.files.image;
          const picData = pic.data;
          const encodePic = picData.toString('base64');
          const imageBuffer = Buffer.from(encodePic, 'base64');
          const doctor = {
            name, 
            email,
            image: imageBuffer
          }
          console.log(doctor)
          const result = await doctorsCollcation.insertOne(doctor);
          console.log(result)
          res.json(result);
        })

        app.get('/users/:email', async (req, res) => {
          const email = req.params.email;
          const query = {email: email};
          const user = await usersCollcation.findOne(query);
          console.log(user);
          let isAdmin = false;
          if(user?.role === 'admin'){
            isAdmin = true;
          };
          res.json({admin: isAdmin});
        })

        app.post('/users', async (req, res) => {
          const user = req.body;
          const result = usersCollcation.insertOne(user);
          console.log(result);
          res.json(result);
        })

        app.put('/users', async (req, res) => {
          const user = req.body;
          const filter = { email: user.email };
          const options = { upsert: true };
          const updateDoc = { $set: user }
          const reuslt = await usersCollcation.updateOne(filter, updateDoc, options);
          res.json(reuslt);
        })

        app.put('/users/admin', verifyToken, async (req, res) => {
          const user = req.body;
          const requester =  req.decodedEmail;
          if(requester){
            const requesterAccount = await usersCollcation.findOne({email : requester});
            if(requesterAccount.role === 'admin'){
              const filter = { email: user.email };
              const updateDoc = { $set : {role : 'admin'} };
              const result = await usersCollcation.updateOne(filter, updateDoc);
              res.json(result);
            }
          }
          else {
            res.status(401).json({message: 'you do not have the access to make admin'});
          }
        })

        app.post("/create-payment-intent", async (req, res) => {
          const paymentInfo = req.body;
          const amount = paymentInfo.price * 100;
          const paymentIntent = await stripe.paymentIntents.create({
            currency: "usd",
            amount: amount,
            payment_method_types: ['card']

          });
          res.json({ clientSecret: paymentIntent.client_secret })
        })
    }
    finally{
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`listening at ${port}`)
})