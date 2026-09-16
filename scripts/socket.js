import { injectContainer, cleanUp, processTableResult, updateProbabilities, removeContainerHandlers } from "./functions.js";
import { newMarker } from "./canvas_and_layers.js";
import { flushIpDipChatLog } from "./ipdip.js";


/** CONSTANTS */
export const MODULE_ID = "ipdip";
export const SOCKET_MODULE_NAME = "module." + MODULE_ID;


/** ******************************************************* */
/** Message_handler and functions for socket communications */
/** ******************************************************* */

/* Useful dictionary for calling socketWrapper and determining the switch in message_handler */
export const socketDict = {
    injectContainer : "injectContainer",
    cleanUp : "cleanUp",
    tableResult : "tableResult",
    newMarker : "newMarker",
    removeContainerHandlers : "removeContainerHandlers",
    updateProbabilities : "updateProbabilities",
    deleteIpDipMessages : "deleteIpDipMessages",
    flushIpDipChatLog: "flushIpDipChatLog"
}

/* Function used to fire a function locally for the GM and on clients via socket */
export function socketWrapper(requestID, data=null) {
    switch(requestID) {
        case socketDict.injectContainer:
            injectContainer();
            game.socket.emit(SOCKET_MODULE_NAME, {action: socketDict.injectContainer});
            break;
        case socketDict.cleanUp:
            cleanUp();
            game.socket.emit(SOCKET_MODULE_NAME, {action: socketDict.cleanUp});
            break;
        case socketDict.tableResult:
            processTableResult(...data);
            game.socket.emit(SOCKET_MODULE_NAME, {action: socketDict.tableResult, data: data});
            break;
        case socketDict.newMarker:
            newMarker(...data);
            game.socket.emit(SOCKET_MODULE_NAME, {action: socketDict.newMarker, data: data});
            break;
        case socketDict.removeContainerHandlers:
            removeContainerHandlers();
            game.socket.emit(SOCKET_MODULE_NAME, {action: socketDict.removeContainerHandlers});
            break;
        case socketDict.updateProbabilities:
            updateProbabilities(...data);
            game.socket.emit(SOCKET_MODULE_NAME, {action: socketDict.updateProbabilities, data: data});
            break;
        case socketDict.deleteIpDipMessages:
            deleteIpDipMessages(data);
            game.socket.emit(SOCKET_MODULE_NAME, {action: socketDict.deleteIpDipMessages, data: data});
            break;
        case socketDict.flushIpDipChatLog:
            flushIpDipChatLog();
            game.socket.emit(SOCKET_MODULE_NAME, {action: socketDict.flushIpDipChatLog});
            break;
        default:
            ui.notifications.error(`Socket action ${requestID} was not found in socketWrapper.`);
    }
}

/* The function that determines the required action when receiving a request from a socket communication. */
export function message_handler(request) {
    switch(request.action) {
        case socketDict.injectContainer:
            injectContainer();
            break;
        case socketDict.cleanUp:
            cleanUp();
            break;
        case socketDict.tableResult:
            processTableResult(...request.data);
            break;
        case socketDict.newMarker:
            newMarker(...request.data);
            break;
        case socketDict.removeContainerHandlers:
            removeContainerHandlers();
            break;
        case socketDict.updateProbabilities:
            updateProbabilities(...request.data);
            break;
        case socketDict.deleteIpDipMessages:
            deleteIpDipMessages(request.data);
            break;
        case socketDict.flushIpDipChatLog:
            flushIpDipChatLog();
            break;
        default:
            ui.notifications.error(`Function ${request.action} was not found in message_handler.`);
    }
}