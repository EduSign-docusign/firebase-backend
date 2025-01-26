const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const admin = require("firebase-admin");

admin.initializeApp();

const db = getFirestore();

exports.onStudentCreated = onDocumentCreated(
  "users/{userId}",
  async (event) => {
    const snapshot = event.data;
    const userData = snapshot.data();

    if (!(userData.type == "student")){
        console.log("Not a student created. Returning")
        return
    }

    const studentId = event.params.userId

    if (!userData || !userData.parentEmail) {
      console.log("No parentEmail found in the student data.");
      return;
    }

    const parentEmail = userData.parentEmail;

    try {
      // Check if a parent document with the parentEmail exists
      const parentQuery = db
        .collection("users")
        .where("email", "==", parentEmail);
      const parentQuerySnapshot = await parentQuery.get();

      if (parentQuerySnapshot.empty) {
        // Parent document does not exist, create a temp account
        const tempPassword = generateTempPassword();
        const auth = getAuth();
        const userRecord = await auth.createUser({
          email: parentEmail,
          password: tempPassword,
          displayName: "Temporary Parent Account",
        });

        console.log(
          `Firebase Authentication account created for parent: ${userRecord.uid}
          ${parentEmail} ${tempPassword}`
        );

        await db.collection("users").doc(studentId).update({
            tempPassword: tempPassword,
            parentID: userRecord.uid,
        })

        await db.collection("users").doc(userRecord.uid).set({
            email: parentEmail,
            type: "parent",
            name: userData.parentName,
            pfp_url: "https://i.pinimg.com/736x/ff/82/b6/ff82b607537ed90b2f343c643960acfa.jpg",
            children: [
              {
                email: userData.email,
                name: userData.name,
                id: studentId,
              }
            ]
        });

        console.log(`Parent document created for email: ${parentEmail}`);

              
      } else {
        console.log(`Parent document already exists for email: ${parentEmail}`);

        const parentDocRef = parentQuerySnapshot.docs[0].ref;
        const parentDocSnap = await parentQuerySnapshot.docs[0].ref.get();
        const parentDocData = parentDocSnap.data()

        await db.collection("users").doc(studentId).update({
          parentID: parentDocRef.id,
          pending_parent: true
        })

        await parentDocRef.update({
          pending_children: [...parentDocData.pending_children || [], {
            email: userData.email,
            name: userData.name,
            id: studentId,
          }],
        });

        console.log(`Added ${userData.name} to pending_children array.`);      }
    } catch (error) {
      console.error("Error handling new student document: ", error);
    }
  }
);

// Function to generate a temporary password
const generateTempPassword = () => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const passwordLength = 6;
  let password = "";
  for (let i = 0; i < passwordLength; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    password += chars[randomIndex];
  }
  return password;
};
