async function handleTaskPolling(taskId) {
    console.log("background.js: Handling task polling for", taskId);
    const response = await fetch("https://noaiedits.quadvision.eu/api/upload?id=" + taskId, {
        method: "GET",
        headers: {
            "User-Agent": "NoAIEditsExtension/1.0"
        }
    });

    const responseStatus = response.status;
    var responseHeaders = response.headers;
    var responseHeadersObj = Object.fromEntries(responseHeaders.entries());
    if(responseHeadersObj["content-type"] && responseHeadersObj["content-type"].includes("image/gif")) {
        // GIF response
        console.log("background.js: Received GIF response for task", taskId);
        var blob = await response.blob();
        return new Promise((resolve, reject) => {
            // Convert blob to data URL
            const reader = new FileReader();
            reader.onloadend = () => {
                console.log("background.js: Finished reading GIF blob for task", taskId);
                resolve({ status: 200, headers: Object.fromEntries(responseHeaders.entries()), data: reader.result });
            };
            reader.onerror = () => {
                console.error("background.js: Error reading GIF blob for task", taskId);
                reject(new Error("Failed to read blob"));
            };
            reader.readAsDataURL(blob);
        });
    }else {
        // Other response
        const textData = await response.text();
        return {status: responseStatus, headers: Object.fromEntries(responseHeaders.entries()), data: textData}; 
    }
}
async function handleUpload(imageURL, imageName) {
    console.log("background.js: Handling upload for", imageName);
    let formData = new FormData();
    // dataURL -> Blob -> File
    let imageBlob = await (await fetch(imageURL)).blob();
    let imageFile = new File([imageBlob], imageName, { type: imageBlob.type });
    formData.append("file", imageFile);
    const response = await fetch("https://noaiedits.quadvision.eu/api/upload", {
        method: "POST",
        body: formData,
        headers: {
            "User-Agent": "NoAIEditsExtension/1.0"
        }
    });

    const responseText = await response.text();
    const responseStatus = response.status;
    const responseHeaders = response.headers;
    return { status: responseStatus, headers: Object.fromEntries(responseHeaders.entries()), text: responseText };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("background.js: Received message", message);
    if (message.imageURL) {
        // upload
        handleUpload(message.imageURL, message.imageName).then(text => {
            sendResponse(text);
        });
        return true; 
    }
    if (message.taskId) {
        // poll
        handleTaskPolling(message.taskId).then(result => {
            sendResponse(result);
        });
        return true;
    }
});