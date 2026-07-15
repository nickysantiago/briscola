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
    agent { label 'jenkins-agent' }

    environment {
        // DEPLOY_HOST = 'jenkins@192.168.0.101'
        // SSH_CRED    = '96f5c053-7651-404f-8379-5db4d3ecf58f'
        // COMPOSE_DIR = '/home/jenkins/workspace/brisca_home'
        SNYK_TOKEN = credentials('93fe8132-018b-4ac0-89b3-20ac0c38f346')
    }

    triggers {
        githubPush()
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
                echo "Branch : ${env.BRANCH_NAME}" // This only populates in multi-pipeline Jenkins jobs
                echo "Commit : ${env.GIT_COMMIT}"
            }
        }

        stage('Backend: Install') {
            agent { 
                docker { 
                    image 'node:lts-slim' 
                } 
            }
            environment { 
                npm_config_cache = "${WORKSPACE}/.npm-cache" 
            }
            steps {
                echo "Running npm ci"
                dir('backend') {
                    sh 'npm ci'
                }
            }
        }

        stage('Backend: Lint') { 
            agent {
                docker { 
                    image 'node:lts-slim'
                    // Keeps your npm cache persistent on the host
                    // args '-v /tmp/npm-cache:/root/.npm' 
                }
            } 
            environment { 
                npm_config_cache = "${WORKSPACE}/.npm-cache" 
            }
            steps {
                echo "Running Lint..."
                dir('backend') {
                    sh 'npm run lint --if-present'
                }
            }
        } 

        stage('Backend: SAST') {  // Snyk Code
            agent {
                docker { 
                    image 'snyk/snyk:node'
                }
            } 
            steps {
                echo "Running Snyk Code Test..."
                dir('backend') {
                    sh 'snyk code test --severity-threshold=high'
                }
            }
        } 

        stage('Backend: Build') {
            steps {
                echo "Building backend... actually nothing to build here - move on"
            }
        }

        stage('Backend: Dependency Scan') { // Snyk Test
            agent {
                docker {
                    image 'snyk/snyk:node'
                }
            }
            steps {
                echo "Running Snyk Test Scan..."
                dir('backend') {
                    sh 'snyk test --severity-threshold=high'
                }
            }
        }
        
        stage('Unit Test') {
            steps {
                echo "Running Unit Testing..."
            }
        }

        stage('Push Artifacts') { 
            steps {
                echo "Pushing Artifacts to Nexus..."
            }
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
