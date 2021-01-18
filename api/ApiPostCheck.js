import axios from 'axios';
import AsyncStorage from '@react-native-community/async-storage';

//Retry Codes are API specific
const retryCodes = [401, 408, 500, 502, 503, 504, 522, 524];

const apiAxios = axios.create({
    baseURL: "https://api.my_company.com/",
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
    _retryCount: 0, //Initilize the retry count
    _millisecondsDelay: 1000, 
});

const maxRetryCount = 2;

let isRefreshing = false;
let failedQueue = [];

apiAxios.interceptors.request.use( async (axiosConfig) => {
    let authToken = await AsyncStorage.getItem("auth_key");
    
    if (authToken != null) {
        axiosConfig.headers.Authorization = "Bearer " + authToken;
    }

    return axiosConfig;
}, (error) => {
    return Promise.reject(error);
});

apiAxios.interceptors.response.use((response) => {

    const responseObj = {
        url: response.config.url,
        payload: response.config.data,
        responseStatus: response.status,
        responseBodyCount: response.data.count,
        responseBody: response.data.results
    };

    // console.log(responseObj); //Enable for debugging or store to log file here

    return response;
}, async function (error) {
   
    const errorObj = {
        url: error.config.url,
        payload: error.config.data,
        responseStatus: error.response.status,
        responseBody: error.response.data
    };

    // console.log(errorObj); //Enable for debugging or store to log file here

    const originalRequest = error.config;    

    const responseStatus = error.hasOwnProperty('response') ? error.response != undefined ? error.response.status : null : null;
    
    //Stop the retry once max retries reached
    if(originalRequest == null || originalRequest._retryCount >= maxRetryCount){
        console.log("API.js: Max retry reached");
        return Promise.reject(error);
    }

    //When an api is already getting a refresh token, queue all api calls that failed to retry after refresh is done
    if (isRefreshing == true) {
        return new Promise(function(resolve, reject) {
            failedQueue.push({ resolve, reject });
        })
        .then(newAuthToken => {
            axiosConfig.headers.Authorization = "Bearer " + newAuthToken;
            return apiAxios(axiosConfig);
        })
        .catch(err => {
            return Promise.reject(err);
        });
    }

    //Token has expired error
    if(responseStatus !== null && responseStatus === 401) {
        let authToken = await AsyncStorage.getItem("auth_key");
        
        try {
            authToken = await refreshAuth(authToken); //Make API call here and return new auth token
        } catch (e) {
            console.log("API.js Intercertor Request refresh error " + e.message);
            throw error(e);
        }

        //Start processing the queue waiting for token refresh to finish
        processQueue(null, authToken);
  
        originalRequest.headers.Authorization = "Bearer " + authToken;
    }

    if(responseStatus !== null && retryCodes.includes(responseStatus)) {
        originalRequest._retryCount++;

        //Timeout Connection Error -- Increase the timeout
        if(responseStatus == 408){ 
            originalRequest.timeout *= 2;
        } 

        //Delay between retries -- Exponential Backoff
        originalRequest._millisecondsDelay *= 2;
        return sleepRequest(originalRequest, originalRequest._millisecondsDelay);
    }

    return Promise.reject(error);
});

const processQueue = (error, token = null) => {
    
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });

    isRefreshing = false;
    failedQueue = [];
};
  
const sleepRequest = (originalRequest, milliseconds) => {

    return new Promise((resolve, reject) => {
        setTimeout(() => resolve(apiAxios(originalRequest)), milliseconds);
    });

};

export default apiAxios;