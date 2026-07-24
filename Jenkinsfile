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


def images = [:] // Global map to store Docker image objects

pipeline {
    agent { label 'jenkins-agent' }

    environment {
        // Snyk 
        SNYK_TOKEN = credentials('93fe8132-018b-4ac0-89b3-20ac0c38f346')
        SNYK_SEVERITY = 'high' // Severity threshold - snyk scans fail if this level is met or exceeded

        // Get the last 5 characters of the commit ID - used with Docker image tag
        COMMIT_HASH  = "${env.GIT_COMMIT[-5..-1]}"

        // Docker
        DOCKER_TOKEN = credentials('79fad4f8-91d6-4fc1-9bcb-273887039ad9') // Dockerhub Credentials
        IMAGE_NAME = 'briscola-backend' // <---------------- Change this later 
        DOCKER_USER = 'nickysantiago'
        IMAGE_TAG = "${env.COMMIT_HASH}"
        // DOCKER_REPO = 'nickysantiago/briscola-backend'

        // Nexus Artifact Repository
        NEXUS_PROTOCOL = 'https'
        NEXUS_URL = 'nexus.nsantiago.me'
        NEXUS_RAW_REPO = 'briscola-raw'
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

        stage('Install') {
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

        stage('Lint') { 
            agent {
                docker { 
                    image 'node:lts-slim'
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

        stage('SAST Scan') {  // Snyk Code
            agent {
                docker { 
                    image 'snyk/snyk:node'
                    // Force the container to run as the Jenkins host user
                    args '-u 1001:1001'
                }
            } 
            steps {
                echo "Running Snyk Code Test..."
                // Need to handle failure due to exceeding severity threshold - communicate the job failed because of it
                dir('backend') {
                    sh 'snyk code test --severity-threshold=high > snyk-sast-report.txt'
                }
            }
            post {
                always {
                    // Archive the report from the 'backend' directory so it's saved to the build
                    archiveArtifacts artifacts: 'backend/snyk-sast-report.txt', allowEmptyArchive: false
                }
            }
        } 

        stage('Build') {
            steps {
                echo "Building backend... actually nothing to build here - move on"
            }
        }

        stage('SCA Scan') { // Snyk Test
            agent {
                docker {
                    image 'snyk/snyk:node'
                    // Force the container to run as the Jenkins host user
                    args '-u 1001:1001'
                }
            }
            steps {
                echo "Running Snyk Test Scan..."
                dir('backend') {
                    // Need to handle failure due to exceeding severity threshold - communicate the job failed because of it
                    sh 'snyk test --severity-threshold=high > snyk-sca-report.txt'
                }
            }
            post {
                always {
                    // Archive the report from the 'backend' directory so it's saved to the build
                    archiveArtifacts artifacts: 'backend/snyk-sca-report.txt', allowEmptyArchive: false
                }
            }
        }

        stage('Generate SBOM') {
            steps {
                sh '''
                    docker run \
                    -u 1001:1001 --rm \
                    -v ${WORKSPACE}/backend:/src \
                    -e XDG_CACHE_HOME=/src/.cache \
                    anchore/syft:v1.48.0-nonroot \
                    -o cyclonedx-json=/src/sbom-backend.json \
                    dir:/src
                '''
            }
            post {
                always {
                    archiveArtifacts artifacts: 'backend/sbom-backend.json', allowEmptyArchive: false
                }
            }
        }

        stage('Unit Test') {
            agent {
                docker { 
                    image 'node:lts-slim'
                    // Force the container to run as the Jenkins host user
                    args '-u 1001:1001'
                }
            } 
            environment { 
                npm_config_cache = "${WORKSPACE}/.npm-cache" 
            }
            steps {
                echo "Running Unit Testing..."
                dir('backend') {
                    sh 'npm test | tee test-coverage-report.txt'
                }
            }
            post {
                always {
                    // Archive the report from the 'backend' directory so it's saved to the build
                    archiveArtifacts artifacts: 'backend/test-coverage-report.txt', allowEmptyArchive: true
                }
            }
        }

        stage('Build Docker Image') {
            steps {
                dir('backend') {
                    echo "Building Backend Docker Image..."

                    // Extracts version from package.json dynamically
                    script {
                        def packageJson = readJSON file: 'package.json'
                        env.APP_VERSION = packageJson.version
                        // backendImage = docker.build("${IMAGE_NAME}:${COMMIT_HASH}")
                        images['backendImage']  = docker.build("${DOCKER_USER}/${IMAGE_NAME}:${IMAGE_TAG}")
                    }

                    // BUILDS BACKEND IMAGE
                    // sh "docker build -t ${IMAGE_NAME}:${env.APP_VERSION} ." <---- will come back to this, using branch name for now
                    // sh "docker build -t ${IMAGE_NAME}:${env.BRANCH_NAME} ."
                    // sh "docker build -t ${IMAGE_NAME}:${COMMIT_HASH} ."
                }
            }
        }

        stage('Container Scan') {
            agent {
                docker {
                    // Use official Snyk CLI image (or 'snyk/snyk:node' / 'snyk/snyk-cli:docker')
                    image 'snyk/snyk:docker'
                    // IMPORTANT: Mount the Docker socket so Snyk can read the local host image
                    args '-u root -v /var/run/docker.sock:/var/run/docker.sock'
                    // Ensures the stage uses the current workspace built in previous steps
                    reuseNode true 
                }
            }
            steps {
                dir('backend') {
                    echo "Running Snyk container scan..."
                    script {
                        def scanFailed = false

                        try {
                            /*
                           - Run snyk container test
                           - Pipe stdout & stderr to the report file
                           - Snyk returns exit code 1 if vulns are >= severity threshold
                            */
                            sh """
                                snyk container test ${IMAGE_NAME}:${IMAGE_TAG} \
                                  --file=Dockerfile \
                                  --severity-threshold=${SNYK_SEVERITY} > snyk-container-report.txt 2>&1
                            """
                        }
                        catch(Exception e) {
                            scanFailed = true
                            echo "Snyk Scan detected issues exceeding the severity threshold!"
                        }

                        if (scanFailed) {
                            error("Pipeline failed: Exceeded vulnerability threshold (${SNYK_SEVERITY}). See Snyk Container report for this build.")
                        }
                    }
                }
            }
            post {
                always {
                    // Always archive the report file so it is saved to the build execution
                    archiveArtifacts artifacts: 'snyk-container-report.txt', allowEmptyArchive: true
                }
            }
        }

        stage('Push Docker Images') {
            steps {
                dir('backend') {
                    echo "Pushing backend app to dockerhub..."
                    script {
                        docker.withRegistry('https://index.docker.io/v1/', '79fad4f8-91d6-4fc1-9bcb-273887039ad9') {
                            // Push each image stored in the map
                            images.each { name, img ->
                                img.push()
                                //img.push('latest')
                            }
                        }
                    }
                }
            }
        }

        stage('Push Artifacts') { 
            steps {
                dir('backend') {
                    // Retrieve archived files to send to nexus repo
                    unarchive mapping: ['backend/snyk-sast-report.txt': 'snyk-sast-report.txt']
                    unarchive mapping: ['backend/snyk-sca-report.txt': 'snyk-sca-report.txt']
                    unarchive mapping: ['backend/sbom-backend.json': 'sbom-backend.json']
                    unarchive mapping: ['backend/test-coverage-report.txt': 'test-coverage-report.txt']
                    
                    
                    withCredentials([usernamePassword(credentialsId: 'nexus-jenkins', usernameVariable: 'NEXUS_USER', passwordVariable: 'NEXUS_PASS')]) {
                        echo "Uploading Scan and Unit Test Reports and SBOM to Nexus Raw Repository..."
                        
                        // Upload SAST Report
                        sh """
                            curl -v -u ${NEXUS_USER}:${NEXUS_PASS} \
                            --upload-file snyk-sast-report.txt \
                            ${NEXUS_PROTOCOL}://${NEXUS_URL}/repository/${NEXUS_RAW_REPO}/${IMAGE_NAME}/${env.APP_VERSION}/backend-snyk-sast-report.txt
                        """

                        // Upload SCA Report
                        sh """
                            curl -v -u ${NEXUS_USER}:${NEXUS_PASS} \
                            --upload-file snyk-sca-report.txt \
                            ${NEXUS_PROTOCOL}://${NEXUS_URL}/repository/${NEXUS_RAW_REPO}/${IMAGE_NAME}/${env.APP_VERSION}/backend-snyk-sca-report.txt
                        """
                        
                        // Upload SBOM
                        sh """
                            curl -v -u ${NEXUS_USER}:${NEXUS_PASS} \
                            --upload-file sbom-backend.json \
                            ${NEXUS_PROTOCOL}://${NEXUS_URL}/repository/${NEXUS_RAW_REPO}/${IMAGE_NAME}/${env.APP_VERSION}/backend-sbom.json
                        """

                        // Upload Unit Test Report
                        sh """
                            curl -v -u ${NEXUS_USER}:${NEXUS_PASS} \
                            --upload-file sbom-backend.json \
                            ${NEXUS_PROTOCOL}://${NEXUS_URL}/repository/${NEXUS_RAW_REPO}/${IMAGE_NAME}/${env.APP_VERSION}/test-coverage-report.txt
                        """
                    }
                }
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

    } // stages

    post {
        always {
            script {
                try {
                    cleanWs()
                } catch (e) {
                    echo "Workspace cleanup skipped: ${e.message}"
                }
            }
        }
        success {
            echo "Pipeline completed. Processed: ${env.CHANGED_DIRS}"
        }
        failure {
            echo "Pipeline failed. Processed: ${env.CHANGED_DIRS}"
        }
        unstable {
            echo "Pipeline unstable. Processed: ${env.CHANGED_DIRS}"
        }
    } // post
} // pipeline
