pipeline {
    agent any
    stages {
        stage('Build') {
            steps {
                sshagent(['96f5c053-7651-404f-8379-5db4d3ecf58f']) {
                    sh 'ssh -o StrictHostKeyChecking=no jenkins@192.168.0.101 "/home/jenkins/workspace/brisca_home/build.sh"'
                }
            }
        }
        stage('Deploy') {
            steps {
                sshagent(['96f5c053-7651-404f-8379-5db4d3ecf58f']) {
                    sh 'ssh -o StrictHostKeyChecking=no jenkins@192.168.0.101 "/home/jenkins/workspace/brisca_home/deploy.sh"'
                }
            }
        }
        stage('Cleanup') {
            steps {
                sshagent(['96f5c053-7651-404f-8379-5db4d3ecf58f']) {
                    sh 'ssh -o StrictHostKeyChecking=no jenkins@192.168.0.101 "/home/jenkins/workspace/brisca_home/cleanup.sh"'
                }
            }
        }
    }
}
