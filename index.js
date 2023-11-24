const express=require('express')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app=express()
const cors=require('cors')
const stripe=require('stripe')('sk_test_51OFixIHJITbsBDxmvNCE51uNJsCeSp8TX2K8SZEAQRD5iFC4YMeV0ugW0GZgMqQCkngCHUj6QidPsJfLII7mrHYh00bKO6ArcX');


const jwt=require('jsonwebtoken')
require('dotenv').config()
const port=process.env.PORT || 5000;

//middle wire

app.use(express.json())
app.use(cors())

console.log(process.env.USER_NAME)
console.log(process.env.USER_PASS)

const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.USER_PASS}@cluster0.7auoehb.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    
  const userCollection=client.db('bistroBd').collection('users')
  const menuCollection=client.db('bistroBd').collection('menu')
  const reviewsCollection=client.db('bistroBd').collection('reviews')
  const cartCollection=client.db('bistroBd').collection('carts')
  const paymentCollection=client.db('bistroBd').collection('payment')


  //jwt related token

  app.post('/jwt',async(req,res)=>{
    const user=req.body;
    const token=jwt.sign(user,process.env.ACCESS_TOKEN_SECRET,{expiresIn:'1h'})

    res.send({token});
  })

//users related 
app.post('/users',async(req,res)=>{
  const user=req.body;
const query={email:user.email}
const exestingUser=await userCollection.findOne(query)
if(exestingUser){
  return res.send({message:'user already exist',insertedId:null})
}
  const result=await userCollection.insertOne(user)

  res.send(result)
})

//middle wire

const veryfyToken=(req,res,next)=>{
  console.log('verfytoken',req.headers.authorization)
  if(!req.headers.authorization){

     return res.status(401).send({message: 'forbidden access'})
  }

  const token=req.headers.authorization.split(' ')[1]
  jwt.verify(token,process.env.ACCESS_TOKEN_SECRET,(err,decoded)=>{

    if(err){
      return res.status(401).send({message: 'forbidden access'})
    }

    req.decoded=decoded
    next()
  })
}

const verfyAdmine=async(req,res,next)=>{
  const email=req.decoded.email;
  const query={email:email}
  const user=await userCollection.findOne(query)
  const isAdmine=user?.role==='admine';
  if(!isAdmine){
    return res.status(403).send({message:'forbidden access'})
  }

  next()
}
// const verfyAdmine = async (req, res, next) => {
//   try {
//       const token = req.headers.authorization;
//       const decoded = jwt.verify(token, process.env.SECRET_KEY);
//       const query = { _id: decoded.id }; // Assuming you want to find a user based on the decoded ID

//       const user = await userCollection.findOne(query);
      
//       if (!user || user.role !== 'admin') {
//           return res.status(403).json({ error: 'Unauthorized' });
//       }

//       next(); // Continue with the next middleware
//   } catch (error) {
//       console.error("Error:", error);
//       return res.status(401).json({ error: 'Invalid token' });
//   }
// };



app.get('/users',veryfyToken,verfyAdmine,async(req,res)=>{
  
  const result=await userCollection.find().toArray()
  res.send(result)
})

app.delete('/users/:id',verfyAdmine,veryfyToken,async(req,res)=>{
  const id=req.params.id;
  const query={_id: new ObjectId(id)}

  const result=await userCollection.deleteOne(query)
  res.send(result)
})

//pament api key

app.post('/create-payment-intent',async(req,res)=>{
  const {price}=req.body;
  const amount=parseInt(price*100);
  console.log(amount, 'amount inside the intent')
  const paymentIntent=await stripe.paymentIntents.create({
    amount:amount,
    currency:'usd',
    payment_method_types:['card'],

  })
  res.send({
    clientSecret: paymentIntent.client_secret,
  })
})


app.get('/payments/:email', veryfyToken, async (req, res) => {
  const query = { email: req.params.email }
  if (req.params.email !== req.decoded.email) {
    return res.status(403).send({ message: 'forbidden access' });
  }
  const result = await paymentCollection.find(query).toArray();
  res.send(result);
})

app.post('/payments', async (req, res) => {
  const payment = req.body;
  const paymentResult = await paymentCollection.insertOne(payment);

  //  carefully delete each item from the cart
  console.log('payment info', payment);
  const query = {
    _id: {
      $in: payment.cartIds.map(id => new ObjectId(id))
    }
  };

  const deleteResult = await cartCollection.deleteMany(query);

  res.send({ paymentResult, deleteResult });
})

///Admin role and the page 
app.patch('/users/admine/:id',verfyAdmine,veryfyToken,async(req,res)=>{
  const id=req.params.id;
  const filter={_id: new ObjectId(id)}

  const updateDoc={
    $set:{
      role:'admine'
    }
  }

  const result=await userCollection.updateOne(filter,updateDoc)
  res.send(result)
})

app.get('/users/admine/:email',veryfyToken,async(req,res)=>{
  
  const email=req.params.email;
  if(email !== req.decoded.email){
    return res.status(403).send({message:'unauthorized access'})
  }
  const query={email: email};
  const user=await userCollection.findOne(query)

  let admin=false;
  if(user){
    admin=user?.role==='admine'
  }

  res.send({admin})
})

 
  //menu related 
app.get('/menu',async(req,res)=>{
  const result=await menuCollection.find().toArray();
  res.send(result)
})

app.post('/menu',veryfyToken,verfyAdmine,async(req,res)=>{
  const items=req.body;
  const result=await menuCollection.insertOne(items)
  res.send(result)
})

app.delete('/menu/:id',async(req,res)=>{
  const id=req.params.id;
  const query={_id:id}

  const result=await menuCollection.deleteOne(query)
  res.send(result)
})

app.patch('/menu/:id',async(req,res)=>{
  const items=req.body;
  const id=req.params.id;
  const filter={_id:id}
  const updateDoc={
    $set:{
      name:items.name,
      category:items.category,
      price:items.price,
      recipe:items.recipe,
      image:items.image
    }
  }
  const result=await menuCollection.updateOne(filter,updateDoc)
  res.send(result)
})

app.get('/menu/:id',async(req,res)=>{
  const id=req.params.id;
  const query={_id:id}
  const result=await menuCollection.findOne(query)
  res.send(result)
})

//review related
app.get('/reviews',async(req,res)=>{
  const result=await reviewsCollection.find().toArray()
  res.send(result)
})

//Catrs collection database 

// app.get('/carts',async(req,res)=>{
//   const email=req.query.email;
//   const query={email:email};
//   const result=await cartCollection.find(query).toArray()
//   res.send(result)
// })
app.get('/carts', async (req, res) => {
  try {
    const email = req.query.email;
    const query = { email: email };
    const result = await cartCollection.find(query).toArray();
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});



app.post('/carts',async(req,res)=>{
  const carsIteam=req.body
  const result=await cartCollection.insertOne(carsIteam)
 
  res.send(result)
})

app.delete('/carts/:id',async(req,res)=>{
  const id=req.params.id;
  const query={_id: new ObjectId(id)}
  const result=await cartCollection.deleteOne(query)
  
  res.send(result)
})

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/',(req,res)=>{
    res.send('bos the sitting')
})

app.listen(port,()=>{
    console.log(`Example app listening on port ${port}`)
})