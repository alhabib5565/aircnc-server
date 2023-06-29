const express = require('express')
const app = express()
const morgan = require('morgan')
const jwt = require('jsonwebtoken')
const cors = require('cors')
require('dotenv').config()
const nodemailer = require('nodemailer');
const port = process.env.PORT || 5000
const stripe = require('stripe')(process.env.PAYMEMT_SECRET_KEY)
// console.log(process.env.PAYMEMT_SECRET_KEY)
// middleware
const corsOptions = {
  origin: '*',
  credentials: true,
  optionSuccessStatus: 200,
}

app.use(cors(corsOptions))
app.use(express.json())
app.use(morgan('dev'))
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.czarj6h.mongodb.net/?retryWrites=true&w=majority`;

const verifyJWT = (req, res, next) => {
  const authrization = req.headers.authorization
  // console.log(authrization)

  if (!authrization) {
    return res.status(401).send({ error: true, message: 'unauthorized access' })
  }
  const token = authrization.split(' ')[1]
  jwt.verify(token, process.env.JWT_SECRETE_KEY, (error, decoded) => {
    if (error) {
      return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    req.decoded = decoded
    next()
  })

}


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

const sendMail = (emailData, emailAddress) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL,
      pass: process.env.PASS
    }
  });

  const mailOptions = {
    from: process.env.EMAIL,
    to: 'alhabib5565@gmail.com',
    subject: `${emailData.subject}`,
    text: `
    <div style="border: 1px solid black;  width: 100%">
    <div style="padding:30px;">
        <p style="font-family: Verdana;">Hi, </p>
        <br>
        <p style="font-weight: 100; font-size: 16px ; line-height: 37px;  font-family: Verdana; color: #1C1E3A; font-family: Verdana;">${emailData?.guest?.name}</p>
        <br>
        <div style="background: transparent linear-gradient(90deg, #2BAD90 0%, #00489A 100%) 0% 0% no-repeat padding-box;
                    background: transparent linear-gradient(90deg, #2BAD90 0%, #00489A 100%) 0% 0% no-repeat padding-box;
                    width: 497px; height: 133px; color: white; padding: 1px 0 10px 0;">
                <p style="text-align: center; font-weight: 100; font-size: 20px ; line-height: 57px;  font-family: Verdana; margin: 0px;">${emailData.message}</p>
        </div>
        <br>
        <br>
    </div>    
</div>
    `
  };

  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      console.log(error);
    } else {
      console.log('Email sent: ' + info.response);
      // do something useful
    }
  });
}

async function run() {
  try {
    const usersCollection = client.db('aircncDB').collection('users')
    const roomsCollection = client.db('aircncDB').collection('rooms')
    const bookingsCollection = client.db('aircncDB').collection('bookings')
    //payment secret 
    app.post('/create-payment-intent', verifyJWT, async (req, res) => {
      const { price } = req.body
      console.log('price from client', price)
      if (!price) {
        return
      }
      const paymentIntent = await stripe.paymentIntents.create({
        amount: parseFloat(price) * 100,
        currency: 'usd',
        payment_method_types: ['card'],
      })
      // console.log(price, paymentIntent)
      res.send({ clientSecret: paymentIntent.client_secret })
    })
    //sign in jwt 
    app.post('/jwt', (req, res) => {
      const email = req.body
      // console.log(email)
      const token = jwt.sign(email, process.env.JWT_SECRETE_KEY, { expiresIn: '1h' })
      // console.log(token)
      res.send({ token })
    })

    app.put('/users/:email', async (req, res) => {
      const email = req.params.email
      const user = req.body
      const query = { email: email }
      const options = { upsert: true };
      const updateDoc = {
        $set: user
      }
      const result = await usersCollection.updateOne(query, updateDoc, options)
      res.send(result)
    })

    // get user 
    app.get('/user/:email', async (req, res) => {
      const email = req.params.email
      const query = { email: email }
      const result = await usersCollection.findOne(query)
      res.send(result)
    })

    //add a room
    app.post('/rooms', async (req, res) => {
      const room = req.body
      const result = await roomsCollection.insertOne(room)
      res.send(result)
    })

    // handle booking 
    app.post('/bookings', async (req, res) => {
      const booking = req.body
      const result = await bookingsCollection.insertOne(booking)

      if (result.insertedId) {
        // Send confirmation email to guest
        sendMail(
          {
            subject: 'Booking Successful!',
            message: `Booking Id: ${result?.insertedId}, TransactionId: ${booking.transactionId}`,
          },
          booking?.guest?.email
        )
        // Send confirmation email to host
        sendMail(
          {
            subject: 'Your room got booked!',
            message: `Booking Id: ${result?.insertedId}, TransactionId: ${booking.transactionId}. Check dashboard for more info`,
          },
          booking?.host
        )
      }

      res.send(result)
    })
    // get bookings by user email
    app.get('/my-bookings', async (req, res) => {
      const email = req.query.email
      if (!email) {
        return res.send([])
      }
      const query = { 'guest.email': email }
      const result = await bookingsCollection.find(query).toArray()
      res.send(result)
    })

    // get bookings by host email
    app.get('/my-bookings/host', async (req, res) => {
      const email = req.query.email
      if (!email) {
        return res.send([])
      }
      const query = { host: email }
      const result = await bookingsCollection.find(query).toArray()
      res.send(result)
    })

    app.delete('/booking/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await bookingsCollection.deleteOne(query)
      res.send(result)
    })

    // my room delete 
    app.delete('/dleteRoom/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await roomsCollection.deleteOne(query)
      res.send(result)
    })

    app.patch('/rooms/status/:id', async (req, res) => {
      const id = req.params.id
      const body = req.body
      const query = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          booked: body.booked
        }
      }
      const result = await roomsCollection.updateOne(query, updateDoc)
      res.send(result)
    })

    //my-listings 
    app.get('/myListings/:email', verifyJWT, async (req, res) => {
      const email = req.params.email
      const decodedEmail = req.decoded.email
      // console.log(decodedEmail)
      if (email !== decodedEmail) {
        return res.status(403).send({ error: true, message: 'Forbidden access' })
      }
      const query = { 'host.email': email }
      const result = await roomsCollection.find(query).toArray()
      res.send(result)
    })

    //all room 
    app.get('/rooms', async (req, res) => {
      const result = await roomsCollection.find().toArray()
      res.send(result)
    })

    // get a room by id
    app.get('/room/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await roomsCollection.find(query).toArray()
      res.send(result)
    })

    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('AirCNC Server is running..')
})

app.listen(port, () => {
  console.log(`AirCNC is running on port ${port}`)
})