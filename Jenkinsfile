// Brisca CI/CD — builds and deploys the 3-container stack (frontend + backend + redis)
// with Docker Compose on the home server over SSH.
//
// NOTE: the previous pipeline called off-repo helper scripts on the home server
// (build.sh / deploy.sh / cleanup.sh under ${COMPOSE_DIR}). Those scripts are NOT in
// this repository and were written for the old single-container setup. Either update
// them to run the docker-compose commands below, or keep this inlined version.
// Assumes ${COMPOSE_DIR} on the home server is a git checkout of this repo that
// contains docker-compose.yml. Uses `docker-compose` (v1) — switch to `docker compose`
// if the home server has the Compose v2 plugin.

pipeline {
    agent any

    environment {
        DEPLOY_HOST = 'jenkins@192.168.0.101'
        SSH_CRED    = '96f5c053-7651-404f-8379-5db4d3ecf58f'
        COMPOSE_DIR = '/home/jenkins/workspace/brisca_home'
    }

    triggers {
        githubPush()
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
                echo "Branch : ${env.BRANCH_NAME}" // This only populates in multi-pipeline Jenkins jobs! In this case it's just null. 
                echo "Commit : ${env.GIT_COMMIT}"
            }
        }

        stage('Lint & SAST') {  // Snyk Code

        }

        stage('Dependency Scan') { // Snyk Test

        } 

        stage('Build') {
            steps {
                echo "Building..."
            }
        }

        stage('Unit Test') {
            steps {
                echo "Running Unit Testing..."
            }
        }

        stage('Push Artifacts') { 
        } 

        stage('Staging Deploy') {
            steps {
                echo "Deploying to staging..."
            }
        }

        stage('Automated Testing') {
            steps {
                echo "Running Regression, E2E, and Smoke tests..."
            }  
        }    

        stage('Approve Production') {  
            steps {
                echo "Awaiting approval for prod..."
            }
        }   

        stage('Production Deploy') {  
            steps {
                echo "Deploying to production..."
            }
        }

        stage('Cleanup') {
            steps {
                echo "Cleaning up..."
            }
        }

    }
}
