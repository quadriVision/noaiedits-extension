function main() {
    console.log("NoAIEdits: Extension main() started");
    const config = { attributes: true, childList: true, subtree: true };
    const callback = (mutationList, observer) => {
    for (const mutation of mutationList) {
        mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1 && node.matches('div[data-testid="toolBar"]')) {
                console.log("NoAIEdits: Found toolBar directly");
                // this'll never happen because twitter uses a wrapper div but whatever
            }
            
            if (node.nodeType === 1 && node.querySelector('div[data-testid="toolBar"]')) {
                console.log("NoAIEdits: Found toolBar nested");
                let target_node = node.querySelector('div[data-testid="toolBar"]');
                let list_node = target_node.querySelector('div[data-testid="ScrollSnap-List"');
                if (!list_node) {
                    console.log("NoAIEdits: ScrollSnap-List not found in toolBar");
                    return;
                }
                if(list_node.querySelector('div.noaiedits-status')) {
                    console.warn("NoAIEdits: Conversion button already exists, skipping");
                    return;
                }
                console.log("NoAIEdits: Adding conversion button to toolBar");
                // add conversion button to the end of the list node
                let convert_button = document.createElement('div');
                convert_button.innerHTML = `
                    <div role="button" style="cursor: pointer; padding: 8px; width: 36px; height: 36px;">
                        <div style="width: 20px; height: 20px;">
                            <img src="${chrome.runtime.getURL('images/editicon.png')}" alt="Upload file as GIF" style="width: 100%; height: 100%;">
                        </div>
                    </div>
                `;
                convert_button.style.height = "36px";
                convert_button.onclick = function() {
                    console.log("NoAIEdits: Conversion button clicked");
                    document.getElementById("noaiedits-input").files = null;
                    document.getElementById("noaiedits-input").value = null;
                    document.getElementById("noaiedits-input").click();
                }
                let hidden_input = document.createElement('input');
                hidden_input.id = "noaiedits-input";
                hidden_input.type = 'file';
                hidden_input.accept = 'image/png,image/jpeg,image/jpg,image/webp';
                hidden_input.style.display = 'none';
                hidden_input.onchange = async function(event) {
                    // since firefox likes to be SOOOOOOOOOOOOO SECURE i have to convert the data uri to a file without fetch :(
                    function dataURItoFile(dataURI) {
                        var BASE64_MARKER = ';base64,';
                        var base64Index = dataURI.indexOf(BASE64_MARKER) + BASE64_MARKER.length;
                        var base64 = dataURI.substring(base64Index);
                        var raw = window.atob(base64);
                        var rawLength = raw.length;
                        var array = new Uint8Array(new ArrayBuffer(rawLength));

                        for(var i = 0; i < rawLength; i++) {
                            array[i] = raw.charCodeAt(i);
                        }
                        return new File([array], "converted.gif", {type: "image/gif"});
                    }
                    console.log("NoAIEdits: Input change");
                    const status_node = document.getElementsByClassName("noaiedits-status");
                    const file = event.target.files[0];
                    if (!file) {
                        console.log("NoAIEdits: No files");
                        return;
                    }
                    console.log("NoAIEdits: File selected:", file.name, file.type, file.size);

                    // read the file's binary and upload it to noaiedits
                    let formData = new FormData();
                    formData.append("file", file);
                    
                    console.log("NoAIEdits: Uploading file");
                    Array.from(status_node).forEach(node => node.innerHTML = '<h3>Uploading file</h3>');
                    try {
                        // convert to base64 and send to background.js
                        const fileReader = new FileReader();
                        try{
                            var imageURL = await new Promise((resolve, reject) => {
                                fileReader.onload = () => {
                                    resolve(fileReader.result);
                                };
                                fileReader.onerror = () => {
                                    reject(new Error("Failed to read file"));
                                };
                                fileReader.readAsDataURL(file);
                            });
                        }catch(e) {
                            console.error("NoAIEdits: Error reading file", e);
                            alert("Error reading file. Please try again.");
                            return;
                        }
                        
                        var upload = await chrome.runtime.sendMessage({imageURL: imageURL, imageName: file.name});
                    }catch(e) {
                        console.error("NoAIEdits: Network error :(", e);
                        alert("Network error. If this issue persists, please DM me on Twitter.");
                        return;
                    }
                    if(upload.status !== 200) {
                        console.error("NoAIEdits: Upload failed", upload.status);
                        alert("Upload failed with status " + upload.status);
                        return;
                    }

                    const taskId = parseInt(upload.text, 10);
                    console.log("NoAIEdits: Upload successful, taskId:", taskId);

                    // poll for conversion result
                    let resultBlob = null;
                    console.log("NoAIEdits: Polling started");
                    Array.from(status_node).forEach(node => node.innerHTML = '<h3>Processing</h3>');
                    while(!resultBlob) {
                        console.log("NoAIEdits: Polling taskId:", taskId, "...");
                        await new Promise(r => setTimeout(r, 2000));
                        try {
                            var result = await chrome.runtime.sendMessage({taskId: taskId});
                        }catch {
                            console.error("NoAIEdits: Network error :(");
                            alert("Network error. If this issue persists, please DM me on Twitter.");
                            return;
                        }
                        console.log(result);
                        if(result.status !== 200) {
                            // something went wrong :(
                            console.error("NoAIEdits: Polling failed", result.status);
                            alert("Conversion failed with status " + result.status);
                            return;
                        }

                        const contentType = result.headers["content-type"] || result.headers["Content-Type"];
                        console.log("NoAIEdits: Polling response status:", result.status, "Content-Type:", contentType);

                        if(contentType && contentType.includes("image/gif")) {
                            // we have our gif!
                            console.log(result);
                            console.log("NoAIEdits: Conversion complete, received GIF");
                            resultBlob = result.data;
                        } else {
                            // processing
                            try {
                                console.log("NoAIEdits: " + result.data);
                            }catch {
                                console.log("NoAIEdits: Still processing, failed to read response text");
                            }
                        }
                    }

                    // upload file
                    console.log("NoAIEdits: Adding GIF to file uploader");
                    const dt = new DataTransfer();
                    dt.items.add(dataURItoFile(resultBlob));
                    
                    let actual_file_uploader = document.querySelector("input[data-testid=\"fileInput\"]");
                    if (actual_file_uploader) {
                        console.log("NoAIEdits: Setting files");
                        actual_file_uploader.files = dt.files;
                        
                        actual_file_uploader.dispatchEvent(new Event('change', { bubbles: true }));
                        Array.from(status_node).forEach(node => node.innerHTML = '<h3>Uploaded!</h3>');
                        console.log("NoAIEdits: Done!");
                    } else {
                        console.error("NoAIEdits: Could not find actual file uploader input[data-testid=\"fileInput\"]");
                    }
                    hidden_input.files = null;
                    
                }
                // print out upload status next to the upload icon
                let status_node = document.createElement('div');
                status_node.className = "noaiedits-status";
                status_node.style.marginLeft = "8px";
                status_node.style.display = "flex";
                status_node.style.alignItems = "center";
                status_node.style.fontSize = "10px";
                status_node.style.height = "36px";
                status_node.style.color = "#1DA1F2";
                status_node.style.fontFamily = "'TwitterChirp', sans-serif";
                convert_button.appendChild(hidden_input);
                list_node.appendChild(convert_button);
                list_node.appendChild(status_node);
            }
        });
    }
    };
    const observer = new MutationObserver(callback);
    observer.observe(document.body, config);
}
if(document.readyState === "loading") {
    console.log("NoAIEdits: Document loading, waiting for DOMContentLoaded");
    document.addEventListener("DOMContentLoaded", () => {
        main();
    });
}else {
    console.log("NoAIEdits: Document already loaded, starting main()");
    main();
}
