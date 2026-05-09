<?php

// ===============================
// DATABASE CONNECTION
// ===============================

$host = "localhost";
$username = "root";
$password = "";
$database = "ai_study_assistant";

// Create connection
$conn = new mysqli($host, $username, $password, $database);

// Check connection
if ($conn->connect_error) {
    die("Connection Failed : " . $conn->connect_error);
}


// ===============================
// GET FORM DATA
// ===============================

$fullname = $_POST['fullname'];
$email = $_POST['email'];
$userpassword = $_POST['password'];
$field = $_POST['field'];
$goals = $_POST['goals'];


// ===============================
// PASSWORD ENCRYPTION
// ===============================

$hashed_password = password_hash($userpassword, PASSWORD_DEFAULT);


// ===============================
// INSERT QUERY
// ===============================

$sql = "INSERT INTO students
(fullname, email, password, field, goals)

VALUES
('$fullname', '$email', '$hashed_password', '$field', '$goals')";


// ===============================
// EXECUTE QUERY
// ===============================

if ($conn->query($sql) === TRUE) {

    echo "
    
    <!DOCTYPE html>
    <html>
    <head>

        <title>Registration Success</title>

        <style>

            body{
                font-family: Arial;
                background: #0f172a;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                color: white;
            }

            .box{
                background: rgba(255,255,255,0.08);
                padding: 40px;
                border-radius: 20px;
                text-align: center;
                width: 400px;
            }

            h1{
                color: #38bdf8;
            }

            p{
                margin-top: 15px;
                color: #ddd;
            }

            a{
                display: inline-block;
                margin-top: 20px;
                padding: 12px 25px;
                background: #2563eb;
                color: white;
                text-decoration: none;
                border-radius: 30px;
            }

        </style>

    </head>

    <body>

        <div class='box'>

            <h1>Registration Successful 🎉</h1>

            <p>
                Welcome to AI Study Assistant
            </p>

            <a href='index.html'>
                Go Back
            </a>

        </div>

    </body>

    </html>

    ";

} 
else {

    echo "Error : " . $conn->error;
}


// ===============================
// CLOSE CONNECTION
// ===============================

$conn->close();

?>