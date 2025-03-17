const admin = require("firebase-admin");
const fs = require("fs");


const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

/**
 * Converts UTC date to IST (UTC+5:30)
 * @param {Date|string} dateString - Date object or date string
 * @return {string} - Formatted date string in IST
 */
function convertToIST(dateString) {
  try {
    const date = dateString instanceof Date ? dateString : new Date(dateString);

    // Check if the date is valid
    if (isNaN(date.getTime())) {
      return dateString; // Return original value if not a valid date
    }

    // Format options for IST
    const options = {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    };

    return new Intl.DateTimeFormat("en-IN", options).format(date);
  } catch (error) {
    console.error("Error converting date:", error);
    return dateString;
  }
}

async function exportFirestoreData() {
  try {
    console.log("Starting Firestore export...");
    const collections = await db.listCollections();
    const exportData = {};

    for (const collectionRef of collections) {
      const collectionId = collectionRef.id;
      console.log(`Processing collection: ${collectionId}`);

      // Create an array to hold documents instead of nested objects
      exportData[collectionId] = [];
      const querySnapshot = await db.collection(collectionId).get();

      querySnapshot.forEach((doc) => {
        const data = doc.data();

        // Convert createdAt to IST if it exists
        if (data.createdAt) {
          data.createdAt = convertToIST(data.createdAt);
        }

        // Add document ID as a field in the data
        exportData[collectionId].push({
          id: doc.id,
          ...data,
        });
      });
    }

    // Create two output files: one for each collection and one combined flat array
    const timestamp = Date.now();

    // Save individual collection files
    for (const collection in exportData) {
      const collectionFile = `${collection}-export-${timestamp}.json`;
      fs.writeFileSync(
        collectionFile,
        JSON.stringify(exportData[collection], null, 2)
      );
      console.log(`Collection ${collection} exported to: ${collectionFile}`);

      // Also save as CSV for easy Excel import
      const csvFile = `${collection}-export-${timestamp}.csv`;
      if (exportData[collection].length > 0) {
        const csvContent = convertToCSV(exportData[collection]);
        fs.writeFileSync(csvFile, csvContent);
        console.log(`Collection ${collection} exported to CSV: ${csvFile}`);
      }
    }

    // Also save the complete data structure
    const completeFile = `all-collections-export-${timestamp}.json`;
    fs.writeFileSync(completeFile, JSON.stringify(exportData, null, 2));
    console.log(`Complete export saved as: ${completeFile}`);

    // Terminate the app
    await admin.app().delete();
    console.log("Export completed successfully!");
  } catch (error) {
    console.error("Error exporting data:", error);
  }
}

/**
 * Convert array of objects to CSV string
 */
function convertToCSV(data) {
  if (data.length === 0) return "";

  // Get all unique headers from all objects
  const headers = Array.from(new Set(data.flatMap((obj) => Object.keys(obj))));

  // Create CSV header row
  let csvContent = headers.join(",") + "\n";

  // Add data rows
  data.forEach((obj) => {
    const row = headers.map((header) => {
      // Handle null, undefined, and formatting of the cell value
      let cellValue =
        obj[header] === null || obj[header] === undefined ? "" : obj[header];

      // Handle objects and arrays by converting to JSON string
      if (typeof cellValue === "object") {
        cellValue = JSON.stringify(cellValue);
      }

      // Escape quotes and wrap in quotes if the value contains commas or quotes
      cellValue = String(cellValue);
      if (
        cellValue.includes(",") ||
        cellValue.includes('"') ||
        cellValue.includes("\n")
      ) {
        cellValue = '"' + cellValue.replace(/"/g, '""') + '"';
      }

      return cellValue;
    });

    csvContent += row.join(",") + "\n";
  });

  return csvContent;
}

// Run the export function
exportFirestoreData();