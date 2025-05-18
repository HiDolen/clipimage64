import { window, Selection, Range } from "vscode";
import path = require("path");
import { saveClipboardImageToFile } from "./saveClipboardImageToFile";
import { readFile, unlink } from "fs";
import LOGGER from "./logger";
import * as sharp from "sharp";

const pasteImageInBase634 = async () => {
    const moment = Date.now();
    const saveInPath = path.join(__dirname, `${moment}.png`);
    const zoomRatioStr = await window.showInputBox({
        prompt: "Please enter the image zoom ratio (e.g., 0.5)",
        placeHolder: "For example: 0.8",
        value: "1",
        validateInput: text => {
            const num = parseFloat(text);
            if (isNaN(num) || num <= 0) {
                return "Please enter a valid number.";
            }
            return null;
        }
    });

    if (zoomRatioStr === undefined) {
        LOGGER.log("User cancelled the input for zoom ratio.");
        return; // User cancelled the input, do not proceed
    }

    const zoomRatio = parseFloat(zoomRatioStr);

    const callback = (callbackError: Error, imagePathReturnByScript: string) => {
        if (callbackError) {
            LOGGER.error(callbackError.message);
            return;
        }

        try {
            if (imagePathReturnByScript === "no image") {
                window.showErrorMessage("No image found in the clipboard.");
                throw new Error("No image found in the clipboard.");
            }
            readFile(imagePathReturnByScript, (err, data) => {
                if (err) {
                    throw err;
                }

                const image = sharp(data);
                image.metadata()
                    .then(metadata => {
                        const originalWidth = metadata.width;
                        const originalHeight = metadata.height;

                        if (originalWidth === undefined || originalHeight === undefined) {
                            throw new Error("Unable to retrieve original image dimensions");
                        }

                        const targetWidth = Math.round(originalWidth * zoomRatio);

                        image
                            .resize(targetWidth) // Resize the image to the target width
                            .webp({ quality: 30, effort: 6, alphaQuality: 10, smartSubsample: true, nearLossless: true })
                            .toBuffer()
                            .then(compressedImageBuffer => {
                                const imageBase64 = compressedImageBuffer.toString("base64");
                                const referenceImage = `![Alternative Text][${moment}]`;
                                const pasteImageString = `[${moment}]:data:image/webp;base64,${imageBase64}`;
                                const editor = window.activeTextEditor;

                                if (!editor) {
                                    LOGGER.error("Undefined active text editor");
                                    return;
                                }

                                const document = editor.document;
                                const lastLine = document.lineAt(document.lineCount - 1);

                                let currentPosition = editor.selection;
                                const endPosition = lastLine.range.end;

                                editor
                                    .edit((edit) => {
                                        // Paste reference image in the current line
                                        if (currentPosition.isEmpty) {
                                            edit.insert(currentPosition.start, referenceImage);
                                        } else {
                                            edit.replace(currentPosition, referenceImage);
                                        }

                                        // The Image text will be paste at the end of the file
                                        edit.insert(endPosition, "\n" + "\n" + pasteImageString);
                                    })
                                    .then((success) => {
                                        if (success) {
                                            const insertedRange = new Range(
                                                currentPosition.start.translate({
                                                    characterDelta: 2,
                                                }),
                                                currentPosition.start.translate({
                                                    characterDelta: 2 + "Alternative Text".length,
                                                })
                                            );
                                            editor.selection = new Selection(
                                                insertedRange.start,
                                                insertedRange.end
                                            );
                                        } else {
                                            window.showErrorMessage(
                                                "Failed to insert text at the end of the file."
                                            );
                                        }
                                    });

                                // Removing residual image
                                unlink(imagePathReturnByScript, (err) => {
                                    if (err) {
                                        LOGGER.error(`Error while deleting residual image: ${err.message}`);
                                        return;
                                    }
                                    LOGGER.log("Residual image removed successfully");
                                });
                            })
                            .catch(err => {
                                LOGGER.error(`Error while compressing image: ${err}`);
                            });
                    });
            });
        } catch (err) {
            LOGGER.error(`Error while reading image File: ${err}`);
        }
    };

    saveClipboardImageToFile(saveInPath, callback);
};

export default pasteImageInBase634;
