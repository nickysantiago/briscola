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

    stages {
        stage('Build') {
            steps {
                sshagent([env.SSH_CRED]) {
                    sh "ssh -o StrictHostKeyChecking=no ${DEPLOY_HOST} 'cd ${COMPOSE_DIR} && git pull --ff-only && docker-compose build'"
                }
            }
        }
        stage('Deploy') {
            steps {
                sshagent([env.SSH_CRED]) {
                    sh "ssh -o StrictHostKeyChecking=no ${DEPLOY_HOST} 'cd ${COMPOSE_DIR} && docker-compose up -d'"
                }
            }
        }
        stage('Cleanup') {
            steps {
                sshagent([env.SSH_CRED]) {
                    sh "ssh -o StrictHostKeyChecking=no ${DEPLOY_HOST} 'docker image prune -f'"
                }
            }
        }
    }
}
